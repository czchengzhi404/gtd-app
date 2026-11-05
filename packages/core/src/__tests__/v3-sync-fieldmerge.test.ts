import { describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import { executeCommand } from "../db/commands";
import type { CommandContext } from "../db/commands";
import { taskFromRow } from "../db/mappers";
import { migrate } from "../db/migrations";
import { captureRecordBases, readRecordBase } from "../db/record-base";
import type { FieldMergeSummary, TaggedRecord } from "../models/commands";
import type { Task } from "../models/task";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";
import { mergeTaskFields, sameFieldValue } from "../sync/fieldmerge";
import { createSyncDepsForExecutor, syncNow } from "../sync/service";
import type { Manifest, SyncProvider } from "../sync/types";

/**
 * v3 · 任务同步的字段级 3-way 合并。
 *
 * 覆盖：
 * 1. 纯函数 mergeTaskFields（不同字段/同字段/无变化/数组整值/对象整值）；
 * 2. schema v6 record_base 迁移与幂等；
 * 3. sync.applyRemote 的现场行为（有基线合并、无基线退回 LWW、墓碑两个方向）；
 * 4. 双设备 syncNow 端到端（合并、冲突报告字段名、基线快照写入）。
 */

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime();

function makeExecutor(db: Database): SqliteExecutor {
  const executor: SqliteExecutor = {
    query: async <T extends SqliteRow>(sql: string, params: readonly unknown[] = []) =>
      db.query(sql).all(...(params as SQLQueryBindings[])) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.run(sql, params as SQLQueryBindings[]);
      return { changes: info.changes };
    },
    transaction: async <T>(
      fn: (tx: SqliteExecutor) => Promise<T>,
      mode: "immediate" | "deferred",
    ) => {
      db.run(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = await fn(executor);
        db.run("COMMIT");
        return result;
      } catch (err) {
        db.run("ROLLBACK");
        throw err;
      }
    },
  };
  return executor;
}

async function openDb(): Promise<{ db: Database; executor: SqliteExecutor }> {
  const db = new Database(":memory:");
  const executor = makeExecutor(db);
  await migrate(executor);
  return { db, executor };
}

const ctxAt = (time: number): CommandContext => ({ now: () => time });

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("期望至少一条元素，实际为空");
  return item;
}

function requireSummary(summary: FieldMergeSummary | undefined): FieldMergeSummary {
  if (summary === undefined) throw new Error("命令结果缺少 mergeSummary");
  return summary;
}

async function readTask(executor: SqliteExecutor, id: string): Promise<Task> {
  const rows = await executor.query<SqliteRow>("SELECT * FROM tasks WHERE id = ?", [id]);
  const row = rows[0];
  if (row === undefined) throw new Error(`任务不存在: ${id}`);
  return taskFromRow(row);
}

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-pure-1",
    title: "原标题",
    notes: "",
    status: "inbox",
    priority: 0,
    deferUntil: null,
    dueAt: null,
    completedAt: null,
    lastCompletedAt: null,
    projectId: null,
    sectionId: null,
    contextIds: [],
    tags: [],
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: "",
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

/** 与生产一致：基线是 JSON 往返后的字段对象（record_base.payload 的形状） */
function snapshotOf(task: Task): Record<string, unknown> {
  return JSON.parse(JSON.stringify(task)) as Record<string, unknown>;
}

describe("mergeTaskFields · 纯函数 3-way", () => {
  test("两端改不同字段 → 合并成功，两边修改都在", () => {
    const base = snapshotOf(baseTask());
    const local = baseTask({ title: "本地标题", revision: 3, updatedAt: NOW + 3000 });
    const remote = baseTask({ notes: "远端笔记", revision: 2, updatedAt: NOW + 2000 });

    const merged = mergeTaskFields(base, local, remote);

    expect(merged.changed).toBe(true);
    expect(merged.mergedFields).toEqual(["notes"]);
    expect(merged.conflictFields).toEqual([]);
    expect(merged.record.title).toBe("本地标题");
    expect(merged.record.notes).toBe("远端笔记");
    // 元数据由调用方决定（revision+1 / updatedAt=now），纯函数不碰
    expect(merged.record.revision).toBe(3);
    expect(merged.record.updatedAt).toBe(NOW + 3000);
  });

  test("两端改同一字段 → 冲突：取本地（revision 高）一侧，字段名正确", () => {
    const base = snapshotOf(baseTask());
    const local = baseTask({ title: "本地标题", revision: 3 });
    const remote = baseTask({ title: "远端标题", revision: 2 });

    const merged = mergeTaskFields(base, local, remote);

    expect(merged.conflictFields).toEqual(["title"]);
    expect(merged.mergedFields).toEqual([]);
    expect(merged.record.title).toBe("本地标题");
    expect(merged.changed).toBe(false);
  });

  test("两边都没变 → 取本地且不产生变更", () => {
    const base = snapshotOf(baseTask());
    const local = baseTask({ revision: 3, updatedAt: NOW + 3000 });
    const remote = baseTask({ revision: 2 });

    const merged = mergeTaskFields(base, local, remote);

    expect(merged.changed).toBe(false);
    expect(merged.mergedFields).toEqual([]);
    expect(merged.conflictFields).toEqual([]);
    expect(merged.record).toBe(local);
  });

  test("数组字段整体替换：不并集、不元素级合并", () => {
    // ① 只有远端改 tags → 整值替换（保留重复与顺序，不做集合运算）
    const base = snapshotOf(baseTask({ tags: ["a"] }));
    const localA = baseTask({ tags: ["a"], revision: 3 });
    const remoteA = baseTask({ tags: ["c", "a", "c"], revision: 2 });
    const mergedA = mergeTaskFields(base, localA, remoteA);
    expect(mergedA.mergedFields).toEqual(["tags"]);
    expect(mergedA.record.tags).toEqual(["c", "a", "c"]);

    // ② 两端都改 tags → 冲突，整体取本地（不是 ["a","b","c"] 的并集）
    const localB = baseTask({ tags: ["a", "b"], revision: 3 });
    const remoteB = baseTask({ tags: ["a", "c"], revision: 2 });
    const mergedB = mergeTaskFields(base, localB, remoteB);
    expect(mergedB.conflictFields).toEqual(["tags"]);
    expect(mergedB.record.tags).toEqual(["a", "b"]);

    // ③ checklist 同理：子项不做元素级合并，冲突时整表取本地
    const emptyBase = snapshotOf(baseTask());
    const localC = baseTask({
      revision: 3,
      checklist: [{ id: "i1", title: "本地子项", done: false, orderKey: "0001" }],
    });
    const remoteC = baseTask({
      revision: 2,
      checklist: [{ id: "i2", title: "远端子项", done: true, orderKey: "0002" }],
    });
    const mergedC = mergeTaskFields(emptyBase, localC, remoteC);
    expect(mergedC.conflictFields).toEqual(["checklist"]);
    expect(mergedC.record.checklist).toEqual([
      { id: "i1", title: "本地子项", done: false, orderKey: "0001" },
    ]);
  });

  test("对象字段（recurrence）整值比较：键顺序不同不算变更，改了则整值取远端", () => {
    const base = snapshotOf(baseTask({ recurrence: { freq: "daily", interval: 1 } }));
    const reordered = { interval: 1, freq: "daily" } as unknown as Task["recurrence"];
    expect(sameFieldValue(reordered, { freq: "daily", interval: 1 })).toBe(true);
    expect(sameFieldValue([1, 2], [2, 1])).toBe(false);

    const local = baseTask({ recurrence: reordered, revision: 3 });
    const remote = baseTask({ recurrence: { freq: "weekly", interval: 2 }, revision: 2 });
    const merged = mergeTaskFields(base, local, remote);

    expect(merged.mergedFields).toEqual(["recurrence"]);
    expect(merged.record.recurrence).toEqual({ freq: "weekly", interval: 2 });
  });
});

describe("migrations · v6 record_base 基线快照表", () => {
  test("建表 + 幂等 + 版本号推进到 6", async () => {
    const db = new Database(":memory:");
    const executor = makeExecutor(db);

    expect(await migrate(executor)).toBe(6);
    // 再跑一次：已是最新版本，不重复应用（幂等）
    expect(await migrate(executor)).toBe(0);

    const columns = db.query("PRAGMA table_info(record_base)").all() as { name: string }[];
    expect(columns.map((column) => column.name)).toEqual(["record_id", "payload", "captured_at"]);

    const version = db
      .query("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(version.value).toBe("6");

    db.close();
  });
});

describe("sync.applyRemote · 任务字段级合并", () => {
  test("有基线 + 本地 revision 更高 + 两端改不同字段 → 合并写回，revision+1、base 更新", async () => {
    const { db, executor } = await openDb();
    const created = first(
      (await executeCommand(executor, "task.create", { title: "原标题" }, ctxAt(NOW))).records,
    ).record as Task;
    // 基线 = rev1 内容（等价于"上次同步时写出的样子"）
    await captureRecordBases(executor, [{ type: "task", record: created }], NOW);

    // 本地：改标题（rev2）→ 加星（rev3）
    await executeCommand(
      executor,
      "task.update",
      { id: created.id, patch: { title: "本地标题" } },
      ctxAt(NOW + 1000),
    );
    await executeCommand(
      executor,
      "task.update",
      { id: created.id, patch: { starred: true } },
      ctxAt(NOW + 2000),
    );

    // 远端：rev2 只改 notes，标题仍是基线值
    const remote: Task = { ...created, notes: "远端笔记", revision: 2, updatedAt: NOW + 500 };
    const result = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [{ type: "task", record: remote }] },
      ctxAt(NOW + 3000),
    );

    const after = await readTask(executor, created.id);
    expect(after.title).toBe("本地标题");
    expect(after.notes).toBe("远端笔记");
    expect(after.starred).toBe(true);
    expect(after.revision).toBe(4);
    expect(after.updatedAt).toBe(NOW + 3000);
    expect(result.records.map((record) => record.record.id)).toEqual([created.id]);

    const summary = requireSummary(result.mergeSummary);
    expect(summary.mergedFields).toEqual(["notes"]);
    expect(summary.conflictFields).toEqual([]);
    expect(summary.entries).toEqual([
      { recordId: created.id, mergedFields: ["notes"], conflictFields: [] },
    ]);

    // 基线被更新为合并结果 → 同一条远端再来一次不产生新的变更
    const base = await readRecordBase(executor, created.id);
    expect(base?.notes).toBe("远端笔记");
    const again = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [{ type: "task", record: remote }] },
      ctxAt(NOW + 4000),
    );
    expect(again.records).toEqual([]);
    expect(requireSummary(again.mergeSummary).staleRemotes).toEqual([created.id]);
    expect((await readTask(executor, created.id)).revision).toBe(4);

    db.close();
  });

  test("无基线 → 退回整条 LWW：保持本地，并记入 noBaseConflicts", async () => {
    const { db, executor } = await openDb();
    const created = first(
      (await executeCommand(executor, "task.create", { title: "原标题" }, ctxAt(NOW))).records,
    ).record as Task;
    await executeCommand(
      executor,
      "task.update",
      { id: created.id, patch: { title: "本地标题" } },
      ctxAt(NOW + 1000),
    );
    await executeCommand(
      executor,
      "task.update",
      { id: created.id, patch: { starred: true } },
      ctxAt(NOW + 2000),
    );

    // 刻意不写 record_base
    const remote: Task = { ...created, notes: "远端笔记", revision: 2, updatedAt: NOW + 500 };
    const result = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [{ type: "task", record: remote }] },
      ctxAt(NOW + 3000),
    );

    const after = await readTask(executor, created.id);
    expect(after.title).toBe("本地标题");
    expect(after.notes).toBe(""); // 远端修改丢失：整条 LWW 的既有行为
    expect(after.revision).toBe(3);
    expect(result.records).toEqual([]);

    const summary = requireSummary(result.mergeSummary);
    expect(summary.noBaseConflicts).toEqual([created.id]);
    expect(summary.mergedFields).toEqual([]);
    expect(summary.conflictFields).toEqual([]);

    db.close();
  });

  test("墓碑不被复活：本地墓碑 revision 更高 → 跳过字段合并，保持删除", async () => {
    const { db, executor } = await openDb();
    const created = first(
      (await executeCommand(executor, "task.create", { title: "原标题" }, ctxAt(NOW))).records,
    ).record as Task;
    // 基线存在也不影响：墓碑先于基线判定
    await captureRecordBases(executor, [{ type: "task", record: created }], NOW);
    await executeCommand(executor, "task.softDelete", { id: created.id }, ctxAt(NOW + 1000));

    const remote: Task = { ...created, title: "远端编辑", revision: 1, updatedAt: NOW + 2000 };
    const result = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [{ type: "task", record: remote }] },
      ctxAt(NOW + 3000),
    );

    const after = await readTask(executor, created.id);
    expect(after.deletedAt).not.toBeNull();
    expect(after.title).toBe("原标题"); // 远端字段没有被搬进墓碑
    expect(after.revision).toBe(2);
    expect(result.records).toEqual([]);

    const summary = requireSummary(result.mergeSummary);
    expect(summary.unmergeable).toEqual([created.id]);
    expect(summary.mergedFields).toEqual([]);

    db.close();
  });

  test("墓碑被更高 revision 击败 → 复活；远端墓碑 revision 更高 → 本地被删除", async () => {
    const { db, executor } = await openDb();

    // ① 本地墓碑（rev2）+ 远端活记录 rev3 → 复活
    const revived = first(
      (await executeCommand(executor, "task.create", { title: "将被删除" }, ctxAt(NOW))).records,
    ).record as Task;
    await executeCommand(executor, "task.softDelete", { id: revived.id }, ctxAt(NOW + 1000));
    const reviveEdit: Task = {
      ...revived,
      title: "远端复活编辑",
      revision: 3,
      updatedAt: NOW + 2000,
      deletedAt: null,
    };
    const applied = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [{ type: "task", record: reviveEdit }] },
      ctxAt(NOW + 3000),
    );
    const afterRevive = await readTask(executor, revived.id);
    expect(afterRevive.deletedAt).toBeNull();
    expect(afterRevive.title).toBe("远端复活编辑");
    expect(afterRevive.revision).toBe(3);
    expect(applied.records.map((record) => record.record.id)).toEqual([revived.id]);

    // ② 本地活记录 rev1 + 远端墓碑 rev2 → 本地被删除（墓碑参与普通比较）
    const doomed = first(
      (await executeCommand(executor, "task.create", { title: "远端已删" }, ctxAt(NOW))).records,
    ).record as Task;
    const remoteTomb: Task = { ...doomed, revision: 2, updatedAt: NOW + 4000, deletedAt: NOW + 4000 };
    await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [{ type: "task", record: remoteTomb }] },
      ctxAt(NOW + 5000),
    );
    const afterTomb = await readTask(executor, doomed.id);
    expect(afterTomb.deletedAt).toBe(NOW + 4000);
    expect(afterTomb.revision).toBe(2);

    db.close();
  });
});

interface Device {
  id: string;
  db: Database;
  executor: SqliteExecutor;
  clock: { time: number };
  ctx: CommandContext;
  run: (provider: SyncProvider) => ReturnType<typeof syncNow>;
}

async function makeDevice(id: string, startTime: number): Promise<Device> {
  const { db, executor } = await openDb();
  const clock = { time: startTime };
  const ctx: CommandContext = { now: () => clock.time };
  const apply = createSyncDepsForExecutor(executor, ctx);
  return {
    id,
    db,
    executor,
    clock,
    ctx,
    run: (provider) => syncNow({ provider, executor, deviceId: id, apply, now: () => clock.time }),
  };
}

function createMemoryProvider(): SyncProvider {
  const store = new Map<string, { manifest: Manifest; records: TaggedRecord[] }>();
  const snapshot = (deviceId: string) => {
    const existing = store.get(deviceId);
    if (existing !== undefined) return existing;
    const created = { manifest: {} as Manifest, records: [] as TaggedRecord[] };
    store.set(deviceId, created);
    return created;
  };
  return {
    listDevices: async () => [...store.keys()],
    readManifest: async (deviceId) => store.get(deviceId)?.manifest ?? null,
    writeManifest: async (deviceId, manifest) => {
      snapshot(deviceId).manifest = manifest;
    },
    readRecords: async (deviceId) => store.get(deviceId)?.records ?? [],
    writeRecords: async (deviceId, records) => {
      snapshot(deviceId).records = records;
    },
  };
}

describe("syncNow · 双设备字段级合并端到端", () => {
  test("两端改不同字段 → 合并成功，两边修改都在，另一台拉取后收敛", async () => {
    const provider = createMemoryProvider();
    const a = await makeDevice("device-a", NOW);
    const b = await makeDevice("device-b", NOW);

    const created = first(
      (await executeCommand(a.executor, "task.create", { title: "原标题" }, a.ctx)).records,
    ).record as Task;
    await a.run(provider);
    await b.run(provider);

    // A：改标题（rev2）→ 加星（rev3）；B：只改笔记（rev2）
    a.clock.time = NOW + 1000;
    await executeCommand(a.executor, "task.update", { id: created.id, patch: { title: "A 标题" } }, a.ctx);
    a.clock.time = NOW + 2000;
    await executeCommand(a.executor, "task.update", { id: created.id, patch: { starred: true } }, a.ctx);
    b.clock.time = NOW + 1500;
    await executeCommand(b.executor, "task.update", { id: created.id, patch: { notes: "B 笔记" } }, b.ctx);
    // B 先推送自己的 rev2（同步是快照交换：不推就没人能拉到）
    await b.run(provider);

    a.clock.time = NOW + 3000;
    const reportA = await a.run(provider);

    const onA = await readTask(a.executor, created.id);
    expect(onA.title).toBe("A 标题");
    expect(onA.notes).toBe("B 笔记"); // 远端的笔记被合并进来
    expect(onA.starred).toBe(true); // 本地的加星保留
    expect(onA.revision).toBe(4);
    expect(reportA.fieldMergedRecords).toBe(1);
    expect(reportA.mergedFields).toEqual(["notes"]);
    expect(reportA.conflictFields).toEqual([]);
    expect(reportA.fieldMerges).toEqual([
      {
        deviceId: "device-b",
        recordId: created.id,
        label: "A 标题",
        mergedFields: ["notes"],
        conflictFields: [],
      },
    ]);

    // 另一台设备拉一次 → 双端一致
    b.clock.time = NOW + 4000;
    await b.run(provider);
    const onB = await readTask(b.executor, created.id);
    expect(onB.title).toBe("A 标题");
    expect(onB.notes).toBe("B 笔记");
    expect(onB.revision).toBe(onA.revision);

    a.db.close();
    b.db.close();
  });

  test("两端改同一字段 → 冲突，取 revision 高（本机）一侧，报告带字段名", async () => {
    const provider = createMemoryProvider();
    const a = await makeDevice("device-a", NOW);
    const b = await makeDevice("device-b", NOW);

    const created = first(
      (await executeCommand(a.executor, "task.create", { title: "原标题" }, a.ctx)).records,
    ).record as Task;
    await a.run(provider);
    await b.run(provider);

    // 双方都改标题，A 的 revision 更高（多改了一次 starred）
    a.clock.time = NOW + 1000;
    await executeCommand(a.executor, "task.update", { id: created.id, patch: { title: "A 标题" } }, a.ctx);
    a.clock.time = NOW + 2000;
    await executeCommand(a.executor, "task.update", { id: created.id, patch: { starred: true } }, a.ctx);
    b.clock.time = NOW + 2500;
    await executeCommand(b.executor, "task.update", { id: created.id, patch: { title: "B 标题" } }, b.ctx);
    // B 先推送自己的 rev2，A 才有得拉
    await b.run(provider);

    a.clock.time = NOW + 3000;
    const reportA = await a.run(provider);

    const onA = await readTask(a.executor, created.id);
    expect(onA.title).toBe("A 标题"); // 冲突取本地（revision 高）
    expect(onA.revision).toBe(3); // 没有写回 → 不推进 revision
    expect(reportA.applied).toBe(0);
    expect(reportA.fieldMergedRecords).toBe(0);
    expect(reportA.conflictFields).toEqual(["title"]);
    expect(reportA.mergedFields).toEqual([]);
    const sample = first(reportA.conflictSamples);
    expect(sample).toMatchObject({
      deviceId: "device-b",
      kind: "task",
      recordId: created.id,
      // label 取远端那一版（本地保留的标题见 conflictFields + 本地记录）
      label: "B 标题",
      reason: "field-merge",
      conflictFields: ["title"],
      mergedFields: [],
    });

    // B 拉到 A 的高 revision → 收敛到 A 的标题
    b.clock.time = NOW + 4000;
    await b.run(provider);
    const onB = await readTask(b.executor, created.id);
    expect(onB.title).toBe("A 标题");
    expect(onB.revision).toBe(3);

    a.db.close();
    b.db.close();
  });

  test("syncNow 写完自身快照后写入 record_base（含墓碑）", async () => {
    const provider = createMemoryProvider();
    const a = await makeDevice("device-a", NOW);

    await executeCommand(a.executor, "task.create", { title: "活任务" }, a.ctx);
    const doomed = first(
      (await executeCommand(a.executor, "task.create", { title: "将被删除" }, a.ctx)).records,
    ).record as Task;
    await executeCommand(a.executor, "task.softDelete", { id: doomed.id }, a.ctx);

    a.clock.time = NOW + 1000;
    const report = await a.run(provider);

    expect(report.baseSnapshotFailed).toBe(false);
    expect(report.pushed).toBe(2); // 1 条活任务 + 1 条墓碑
    const rows = await a.executor.query<{ n: number }>("SELECT COUNT(*) AS n FROM record_base");
    expect(rows[0]?.n).toBe(report.pushed);
    // 墓碑也有基线（合并要靠 base 区分"对方改"与"我改"）
    const tombstoneBase = await readRecordBase(a.executor, doomed.id);
    expect(tombstoneBase?.deletedAt).not.toBeNull();

    a.db.close();
  });
});

import { describe, it, expect, beforeEach } from "bun:test";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { SqliteExecutor, SyncProvider, DeviceSnapshot, TaggedRecord } from "@gtd/core";
import {
  migrate,
  executeCommand,
  mergeOne,
  idsToFetch,
  chunkRecords,
  syncNow,
  createFolderProvider,
  createWebDavProvider,
  pickDueNotifications,
  setSqliteExecutor,
} from "@gtd/core";
import type { Manifest, SyncConfig } from "@gtd/core";
import type { FilesPort } from "@gtd/core";

/** 与桌面端同一驱动的内存库执行器 */
function makeExecutor(): SqliteExecutor {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  const executor: SqliteExecutor = {
    query: async <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).all(...params) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes };
    },
    transaction: async <T>(fn: (tx: SqliteExecutor) => Promise<T>, mode: "immediate" | "deferred") => {
      db.exec(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = await fn(executor);
        db.exec("COMMIT");
        return result;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return executor;
}

interface Device {
  id: string;
  executor: SqliteExecutor;
  clock: number;
  applyCalls: { sizes: number[] } ;
}

function makeDevice(id: string, startClock: number): Device {
  const executor = makeExecutor();
  return { id, executor, clock: startClock, applyCalls: { sizes: [] } };
}

function deviceApply(deps: { device: Device; batchSize?: number }) {
  return async (records: TaggedRecord[]): Promise<TaggedRecord[]> => {
    deps.device.applyCalls.sizes.push(records.length);
    const result = await executeCommand(
      deps.device.executor,
      "sync.applyRemote",
      { records },
      { now: () => deps.device.clock },
    );
    return result.records;
  };
}

function createMemoryProvider(): SyncProvider {
  const store = new Map<string, DeviceSnapshot>();
  return {
    listDevices: async () => [...store.keys()],
    readManifest: async (deviceId) => store.get(deviceId)?.manifest ?? null,
    writeManifest: async (deviceId, manifest) => {
      const snap = store.get(deviceId) ?? { manifest: {}, records: [] };
      snap.manifest = manifest;
      store.set(deviceId, snap);
    },
    readRecords: async (deviceId) => store.get(deviceId)?.records ?? [],
    writeRecords: async (deviceId, records) => {
      const snap = store.get(deviceId) ?? { manifest: {}, records: [] };
      snap.records = records;
      store.set(deviceId, snap);
    },
  };
}

async function runSync(device: Device, provider: SyncProvider, batchSize?: number) {
  setSqliteExecutor(device.executor); // syncNow 内部 bootstrap 类查询走端口（本测试显式传 executor）
  return syncNow({
    provider,
    executor: device.executor,
    deviceId: device.id,
    apply: deviceApply({ device, batchSize }),
    now: () => device.clock,
    batchSize,
  });
}

/** 内存库无法直接复用 queries（它们走端口），这里直查 */
async function fetchTask(executor: SqliteExecutor, id: string): Promise<Record<string, unknown> | null> {
  const rows = await executor.query<Record<string, unknown>>(
    "SELECT * FROM tasks WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

const T0 = new Date(2026, 9, 24, 10, 0, 0).getTime();

beforeEach(() => {});

describe("mergeOne 合并规则（revision 优先）", () => {
  const mk = (revision: number, updatedAt: number, deletedAt: number | null = null): TaggedRecord => ({
    type: "task",
    record: {
      id: "t1",
      title: `rev${revision}`,
      notes: "",
      status: "inbox",
      priority: 0,
      dueAt: null,
      completedAt: null,
      lastCompletedAt: null,
      projectId: null,
      sectionId: null,
      contextIds: [],
      waitingFor: null,
      starred: false,
      recurrence: null,
      checklist: [],
      orderKey: "",
      createdAt: T0,
      updatedAt,
      revision,
      deletedAt,
    },
  });

  it("时钟偏差：远端 updatedAt 更新但 revision 更低 → 本地胜（不依赖时钟）", () => {
    const local = mk(5, T0); // 本地：rev5，10:00
    const remote = mk(4, T0 + 3 * 60 * 60 * 1000); // 远端：rev4，但时钟快 3 小时
    const { localNeedsUpdate } = mergeOne(local, remote);
    expect(localNeedsUpdate).toBe(false);
  });

  it("revision 并列 → updatedAt 新者胜（tiebreak）", () => {
    const local = mk(2, T0);
    const remote = mk(2, T0 + 1000);
    expect(mergeOne(local, remote).localNeedsUpdate).toBe(true);
    expect(mergeOne(remote, local).localNeedsUpdate).toBe(false);
  });

  it("本地缺失 → 远端直接胜", () => {
    expect(mergeOne(undefined, mk(1, T0)).localNeedsUpdate).toBe(true);
  });

  it("墓碑参与比较：更高 revision 的墓碑胜过旧编辑；更新编辑击败墓碑则复活", () => {
    const tombstone = mk(6, T0, T0); // 删除 rev6
    const olderEdit = mk(5, T0 + 5000); // 编辑 rev5（时间更新）
    expect(mergeOne(olderEdit, tombstone).localNeedsUpdate).toBe(true); // 墓碑胜

    const resurrect = mk(7, T0); // 删除之后的编辑 rev7
    expect(mergeOne(tombstone, resurrect).localNeedsUpdate).toBe(true); // 复活
  });

  it("idsToFetch：revision/updatedAt/存在性差异都要拉", () => {
    const mine: Manifest = {
      a: { revision: 1, updatedAt: T0, deletedAt: null },
      b: { revision: 3, updatedAt: T0, deletedAt: null },
    };
    const theirs: Manifest = {
      a: { revision: 2, updatedAt: T0, deletedAt: null }, // rev 不同 → 拉
      b: { revision: 3, updatedAt: T0, deletedAt: null }, // 一致 → 不拉
      c: { revision: 1, updatedAt: T0, deletedAt: null }, // 缺失 → 拉
    };
    expect(idsToFetch(mine, theirs).sort()).toEqual(["a", "c"]);
  });

  it("chunkRecords 分批", () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    expect(chunkRecords(items, 3).map((b) => b.length)).toEqual([3, 3, 1]);
    expect(chunkRecords([], 3)).toEqual([]);
  });
});

describe("双设备同步（真实 SQLite + 内存 provider）", () => {
  let provider: SyncProvider;
  let a: Device;
  let b: Device;

  beforeEach(() => {
    provider = createMemoryProvider();
    a = makeDevice("device-a", T0);
    b = makeDevice("device-b", T0);
    void Promise.all([migrate(a.executor), migrate(b.executor)]);
  });

  it("创建 → 双向同步收敛 → 再同步为稳定不动点", async () => {
    const created = await executeCommand(
      a.executor,
      "task.create",
      { title: "跨端任务" },
      { now: () => a.clock },
    );
    const taskId = (created.records[0]?.record as { id: string }).id;

    await runSync(a, provider);
    const reportB = await runSync(b, provider);
    expect(reportB.applied).toBe(1);

    const onB = await fetchTask(b.executor, taskId);
    expect(onB?.title).toBe("跨端任务");

    // B 回推后，A 再同步 → 无新变化（不动点）
    const reportA2 = await runSync(a, provider);
    expect(reportA2.applied).toBe(0);
  });

  it("并发编辑同一条：revision 并列时 updatedAt 新者胜，双端收敛一致", async () => {
    const created = await executeCommand(a.executor, "task.create", { title: "原标题" }, { now: () => T0 });
    const taskId = (created.records[0]?.record as { id: string }).id;
    await runSync(a, provider);
    await runSync(b, provider);

    // 双方都拿到 rev1 → 各自编辑到 rev2；B 的编辑时间更新
    await executeCommand(a.executor, "task.update", { id: taskId, patch: { title: "A 的编辑" } }, { now: () => T0 + 1000 });
    await executeCommand(b.executor, "task.update", { id: taskId, patch: { title: "B 的编辑" } }, { now: () => T0 + 5000 });

    await runSync(a, provider);
    await runSync(b, provider);
    // A 回拉 B 的较新并列版本 → 双端一致
    await runSync(a, provider);

    const onA = await fetchTask(a.executor, taskId);
    const onB = await fetchTask(b.executor, taskId);
    expect(onA?.title).toBe("B 的编辑");
    expect(onB?.title).toBe("B 的编辑");
    expect(onA?.revision).toBe(onB?.revision);
  });

  it("时钟偏差场景：B 时钟快 1 小时但 revision 更低 → 仍输给高 revision", async () => {
    const created = await executeCommand(a.executor, "task.create", { title: "基线" }, { now: () => T0 });
    const taskId = (created.records[0]?.record as { id: string }).id;
    await runSync(a, provider);
    await runSync(b, provider);

    // A 编辑两次（rev3）；B 编辑一次（rev2）但把时钟拨快 1 小时
    await executeCommand(a.executor, "task.update", { id: taskId, patch: { title: "A 第一次" } }, { now: () => T0 + 1000 });
    await executeCommand(a.executor, "task.update", { id: taskId, patch: { title: "A 第二次" } }, { now: () => T0 + 2000 });
    b.clock = T0 + 60 * 60 * 1000;
    await executeCommand(b.executor, "task.update", { id: taskId, patch: { title: "B 偏快时钟" } }, { now: () => b.clock });

    await runSync(a, provider);
    await runSync(b, provider);

    const onA = await fetchTask(a.executor, taskId);
    const onB = await fetchTask(b.executor, taskId);
    expect(onA?.title).toBe("A 第二次");
    expect(onB?.title).toBe("A 第二次");
  });

  it("墓碑删除收敛：陈旧基线上的设备拉到墓碑 → 全端一致删除", async () => {
    const created = await executeCommand(a.executor, "task.create", { title: "将被删除" }, { now: () => T0 });
    const taskId = (created.records[0]?.record as { id: string }).id;
    await runSync(a, provider);
    await runSync(b, provider);

    // A 删除（rev2 墓碑）并推送；B 仍停留在 rev1 基线
    await executeCommand(a.executor, "task.softDelete", { id: taskId }, { now: () => T0 + 1000 });
    await runSync(a, provider);
    await runSync(b, provider);

    const onB = await fetchTask(b.executor, taskId);
    expect(onB?.deleted_at).not.toBeNull();
    expect(onB?.title).toBe("将被删除");

    // 再同步：无回弹
    await runSync(a, provider);
    const onA = await fetchTask(a.executor, taskId);
    expect(onA?.deleted_at).not.toBeNull();
  });

  it("删除后的并发编辑（revision 并列、时间更新）→ 复活，属文档化行为", async () => {
    const created = await executeCommand(a.executor, "task.create", { title: "将被删除" }, { now: () => T0 });
    const taskId = (created.records[0]?.record as { id: string }).id;
    await runSync(a, provider);
    await runSync(b, provider);

    // A 删除（rev2, T0+1000）；B 并发编辑（rev2, T0+9000，时间更新）
    await executeCommand(a.executor, "task.softDelete", { id: taskId }, { now: () => T0 + 1000 });
    await executeCommand(b.executor, "task.update", { id: taskId, patch: { title: "B 的编辑" } }, { now: () => T0 + 9000 });

    await runSync(a, provider);
    await runSync(b, provider);
    await runSync(a, provider);

    // revision 并列 → 时间 tiebreak → B 的编辑胜，记录复活
    const onA = await fetchTask(a.executor, taskId);
    const onB = await fetchTask(b.executor, taskId);
    expect(onA?.deleted_at).toBeNull();
    expect(onB?.deleted_at).toBeNull();
    expect(onA?.title).toBe("B 的编辑");
  });

  it("批量应用：每批独立命令调用（300/批 → 7 批），批间不共享事务", async () => {
    for (let i = 0; i < 2000; i++) {
      await executeCommand(a.executor, "task.create", { title: `任务${i}` }, { now: () => T0 + i });
    }
    await runSync(a, provider);
    const device = makeDevice("device-c", T0);
    await migrate(device.executor);
    const report = await runSync(device, provider, 300);

    expect(report.applied).toBe(2000);
    expect(device.applyCalls.sizes.length).toBe(7);
    expect(device.applyCalls.sizes.filter((s) => s === 300).length).toBe(6);
    expect(device.applyCalls.sizes[6]).toBe(200);
  });
});

describe("文件夹 provider（真实文件系统往返）", () => {
  it("双设备经本地目录收敛", async () => {
    const root = path.join(os.tmpdir(), `gtd-sync-test-${Date.now()}`);
    const files: FilesPort = {
      readFile: async (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null),
      writeFile: async (p, content) => {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf-8");
      },
      listDir: async (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []),
      mkdir: async (p) => fs.mkdirSync(p, { recursive: true }),
    };
    const config: SyncConfig = { kind: "folder", endpoint: root, enabled: true };
    const provider = createFolderProvider(config, files);

    const a = makeDevice("phone", T0);
    const b = makeDevice("desktop", T0);
    await Promise.all([migrate(a.executor), migrate(b.executor)]);

    await executeCommand(a.executor, "task.create", { title: "文件夹同步" }, { now: () => T0 });
    await runSync(a, provider);
    await runSync(b, provider);

    const rows = await b.executor.query<Record<string, unknown>>(
      "SELECT title FROM tasks WHERE deleted_at IS NULL",
    );
    expect(rows[0]?.title).toBe("文件夹同步");

    // 清理
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("WebDAV provider（本地 HTTP 模拟服务器往返）", () => {
  it("PUT/GET/PROPFIND/MKCOL 往返", async () => {
    const store = new Map<string, unknown>();
    const dirs = new Set<string>(["/devices/"]);
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const pathname = decodeURIComponent(url.pathname);
        if (req.method === "MKCOL") {
          dirs.add(pathname.endsWith("/") ? pathname : pathname + "/");
          return new Response(null, { status: 201 });
        }
        if (req.method === "PROPFIND") {
          const base = pathname.endsWith("/") ? pathname : pathname + "/";
          const hrefs = [...dirs, ...[...store.keys()].map((k) => path.dirname(k) + "/")]
            .filter((d) => d.startsWith(base))
            .map((d) => `<D:href>http://localhost${d}</D:href>`)
            .join("");
          return new Response(`<?xml version="1.0"?><D:multistatus>${hrefs}</D:multistatus>`, {
            status: 207,
          });
        }
        if (req.method === "PUT") {
          store.set(pathname, await req.text());
          return new Response(null, { status: 201 });
        }
        if (req.method === "GET") {
          const body = store.get(pathname);
          if (body === undefined) return new Response("nf", { status: 404 });
          return new Response(body as string);
        }
        return new Response("method?", { status: 405 });
      },
    });
    try {
      const config: SyncConfig = {
        kind: "webdav",
        endpoint: `http://localhost:${server.port}`,
        enabled: true,
      };
      const provider = createWebDavProvider(config);
      const a = makeDevice("web-a", T0);
      const b = makeDevice("web-b", T0);
      await Promise.all([migrate(a.executor), migrate(b.executor)]);

      await executeCommand(a.executor, "task.create", { title: "WebDAV 同步" }, { now: () => T0 });
      await runSync(a, provider);
      expect((await provider.listDevices()).sort()).toEqual(["web-a"]);
      await runSync(b, provider);

      const rows = await b.executor.query<Record<string, unknown>>(
        "SELECT title FROM tasks WHERE deleted_at IS NULL",
      );
      expect(rows[0]?.title).toBe("WebDAV 同步");
    } finally {
      server.stop(true);
    }
  });
});

describe("due-scan 到期通知", () => {
  it("今天到期/逾期入选，已完成排除，去重键生效，上限 5 条", () => {
    const now = new Date(2026, 9, 24, 9, 0).getTime();
    const mkTask = (id: string, dueAt: number | null, status = "next") =>
      ({
        id,
        title: id,
        notes: "",
        status,
        priority: 0,
        dueAt,
        completedAt: null,
        lastCompletedAt: null,
        projectId: null,
        sectionId: null,
        contextIds: [],
        waitingFor: null,
        starred: false,
        recurrence: null,
        checklist: [],
        orderKey: "",
        createdAt: T0,
        updatedAt: T0,
        revision: 1,
        deletedAt: null,
      }) as import("@gtd/core").Task;

    const today = new Date(2026, 9, 24, 18, 0).getTime();
    const overdue = new Date(2026, 9, 20, 18, 0).getTime();
    const tasks = [
      mkTask("a", today),
      mkTask("b", overdue),
      mkTask("c", today, "done"),
      mkTask("d", null),
      mkTask("e", new Date(2026, 9, 30, 18, 0).getTime()), // 未来
    ];
    const first = pickDueNotifications(tasks, now, new Set());
    expect(first.due.map((d) => d.taskId).sort()).toEqual(["a", "b"]);

    // 第二次扫描：键已记录 → 空
    const second = pickDueNotifications(tasks, now, new Set(first.newKeys));
    expect(second.due).toEqual([]);

    // dueAt 变化 → 重新提醒
    tasks[0] = mkTask("a", today + 1);
    const third = pickDueNotifications(tasks, now, new Set(first.newKeys));
    expect(third.due.map((d) => d.taskId)).toEqual(["a"]);
  });
});

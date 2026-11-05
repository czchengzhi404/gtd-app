import { describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import { executeCommand } from "../db/commands";
import { migrate } from "../db/migrations";
import { syncNow } from "../sync/service";
import type { TaggedRecord } from "../models/commands";
import type { Manifest, SyncProvider } from "../sync/types";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";

/**
 * 增量推送：记录集与上次一致时跳过写 records.json。
 *
 * 自动同步会被前后台切换/定时器频繁触发，多数时候本地毫无改动；
 * 这里验证"跳过"确实发生、且改动后能恢复写入。
 */

const NOW = new Date(2026, 10, 5, 10, 0, 0).getTime();

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
      } catch (error) {
        db.run("ROLLBACK");
        throw error;
      }
    },
  };
  return executor;
}

interface CountingProvider extends SyncProvider {
  recordWrites: number;
  manifestWrites: number;
  lastRecords: TaggedRecord[];
}

function makeProvider(): CountingProvider {
  const manifests: Record<string, Manifest> = {};
  const provider: CountingProvider = {
    recordWrites: 0,
    manifestWrites: 0,
    lastRecords: [],
    listDevices: async () => Object.keys(manifests),
    readManifest: async (deviceId) => manifests[deviceId] ?? null,
    writeManifest: async (deviceId, manifest) => {
      manifests[deviceId] = manifest;
      provider.manifestWrites += 1;
    },
    readRecords: async () => provider.lastRecords,
    writeRecords: async (_deviceId, records) => {
      provider.recordWrites += 1;
      provider.lastRecords = records;
    },
  };
  return provider;
}

async function setup() {
  const db = new Database(":memory:");
  const executor = makeExecutor(db);
  await migrate(executor);
  return executor;
}

describe("syncNow · 增量推送", () => {
  test("首次同步写 records；无改动再同步则跳过", async () => {
    const executor = await setup();
    await executeCommand(executor, "task.create", { title: "第一条" }, { now: () => NOW });

    const provider = makeProvider();
    const deps = {
      provider,
      executor,
      apply: async (records: TaggedRecord[]) => records,
      deviceId: "dev-a",
      now: () => NOW,
    };

    await syncNow(deps);
    expect(provider.recordWrites).toBe(1);

    // 没有任何本地改动 → 第二次不应再写 records
    await syncNow(deps);
    expect(provider.recordWrites).toBe(1);

    // manifest 仍然每次都写（体积小，且要更新在线状态）
    expect(provider.manifestWrites).toBe(2);
  });

  test("本地改动后恢复写入", async () => {
    const executor = await setup();
    const created = await executeCommand(
      executor,
      "task.create",
      { title: "第一条" },
      { now: () => NOW },
    );
    const taskId = created.ids[0]!;

    const provider = makeProvider();
    const deps = {
      provider,
      executor,
      apply: async (records: TaggedRecord[]) => records,
      deviceId: "dev-a",
      now: () => NOW,
    };

    await syncNow(deps);
    expect(provider.recordWrites).toBe(1);

    await executeCommand(
      executor,
      "task.update",
      { id: taskId, patch: { title: "改过标题" } },
      { now: () => NOW + 1000 },
    );

    await syncNow(deps);
    expect(provider.recordWrites).toBe(2);
    expect(provider.lastRecords.some((item) => item.record.id === taskId)).toBe(true);
  });

  test("删除（墓碑）也算改动，必须推送", async () => {
    const executor = await setup();
    const created = await executeCommand(
      executor,
      "task.create",
      { title: "将被删除" },
      { now: () => NOW },
    );

    const provider = makeProvider();
    const deps = {
      provider,
      executor,
      apply: async (records: TaggedRecord[]) => records,
      deviceId: "dev-a",
      now: () => NOW,
    };

    await syncNow(deps);
    expect(provider.recordWrites).toBe(1);

    await executeCommand(
      executor,
      "task.softDelete",
      { id: created.ids[0]! },
      { now: () => NOW + 1000 },
    );
    await syncNow(deps);
    expect(provider.recordWrites).toBe(2);
  });

  test("两次同步之间新增任务会被推送", async () => {
    const executor = await setup();
    const provider = makeProvider();
    const deps = {
      provider,
      executor,
      apply: async (records: TaggedRecord[]) => records,
      deviceId: "dev-a",
      now: () => NOW,
    };

    await syncNow(deps);
    const firstCount = provider.lastRecords.length;

    await executeCommand(executor, "task.create", { title: "新增" }, { now: () => NOW + 500 });
    await syncNow(deps);

    expect(provider.recordWrites).toBe(2);
    expect(provider.lastRecords.length).toBe(firstCount + 1);
  });
});

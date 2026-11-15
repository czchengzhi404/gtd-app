/**
 * 端到端确认 task.update 的 blockedBy 真的能写进 SQLite 并读回来。
 * 用内存库跑完整命令链，不依赖设备。
 */
import { describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import { migrate } from "../db/migrations";
import { executeCommand } from "../db/commands";
import { loadBootstrapData } from "../db/queries";
import { setSqliteExecutor, setCommandPort } from "../platform/ports";
import { appStore, applyRecords, runCommand } from "../store/app-store";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";

function makeExecutor(db: Database): SqliteExecutor {
  const executor: SqliteExecutor = {
    query: async <T extends SqliteRow>(sql: string, params: readonly unknown[] = []) =>
      db.query(sql).all(...(params as SQLQueryBindings[])) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.run(sql, params as SQLQueryBindings[]);
      return { changes: info.changes };
    },
    transaction: async <T>(fn: (tx: SqliteExecutor) => Promise<T>) => {
      db.run("BEGIN IMMEDIATE");
      try {
        const result = await fn(executor);
        db.run("COMMIT");
        return result;
      } catch (e) {
        db.run("ROLLBACK");
        throw e;
      }
    },
  };
  return executor;
}

describe("task.update · blockedBy 往返", () => {
  test("写入一个前置后能从库里读回来", async () => {
    const db = new Database(":memory:");
    const executor = makeExecutor(db);
    await migrate(executor);
    setSqliteExecutor(executor);
    setCommandPort({
      dispatch: async (op, payload) => executeCommand(executor, op, payload, { now: () => 1_700_000_000_000 }),
    });

    const a = await executeCommand(executor, "task.create", { title: "A" }, { now: () => 1_700_000_000_000 });
    const b = await executeCommand(executor, "task.create", { title: "B" }, { now: () => 1_700_000_000_000 });
    const aId = (a.records[0]?.record as { id: string }).id;
    const bId = (b.records[0]?.record as { id: string }).id;

    await executeCommand(
      executor,
      "task.update",
      { id: bId, patch: { blockedBy: [aId] } },
      { now: () => 1_700_000_000_000 },
    );

    const data = await loadBootstrapData(executor);
    const storedB = data.tasks.find((t) => t.id === bId);
    expect(storedB?.blockedBy).toEqual([aId]);
    db.close();
  });

  test("走 runCommand → applyRecords 后，store 里的 blockedBy 也更新", async () => {
    // 这是设备实测卡住的那一环：日志显示 runCommand 成功、records=1，
    // 但详情页读不到更新后的 blockedBy。用内存库把 store 这一层也验掉。
    const db = new Database(":memory:");
    const executor = makeExecutor(db);
    await migrate(executor);
    setSqliteExecutor(executor);
    setCommandPort({
      dispatch: async (op, payload) => executeCommand(executor, op, payload, { now: () => 1_700_000_000_000 }),
    });
    appStore.setState({ tasks: {} });

    const a = await runCommand("task.create", { title: "A" });
    const b = await runCommand("task.create", { title: "B" });
    applyRecords(a.records);
    applyRecords(b.records);
    const aId = (a.records[0]?.record as { id: string }).id;
    const bId = (b.records[0]?.record as { id: string }).id;

    const result = await runCommand("task.update", { id: bId, patch: { blockedBy: [aId] } });
    expect(result.records).toHaveLength(1);
    expect(
      (result.records[0]?.record as { blockedBy?: string[] }).blockedBy,
    ).toEqual([aId]);
    // runCommand 内部已调用 applyRecords，store 里应能直接看到
    expect(appStore.getState().tasks[bId]?.blockedBy).toEqual([aId]);
    db.close();
  });
});

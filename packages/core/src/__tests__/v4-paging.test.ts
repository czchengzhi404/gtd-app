import { beforeEach, describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import { executeCommand } from "../db/commands";
import { migrate } from "../db/migrations";
import { countTasks, getTasksPage } from "../db/queries";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";

/** 数据库分页：真实 SQLite 上验证页大小、偏移、hasMore、墓碑过滤与排序。 */

const NOW = new Date(2026, 10, 5, 10, 0, 0).getTime();

function makeExecutor(db: Database): SqliteExecutor {
  return {
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
}

let executor: SqliteExecutor;

beforeEach(async () => {
  const db = new Database(":memory:");
  executor = makeExecutor(db);
  await migrate(executor);
  for (let i = 0; i < 25; i += 1) {
    await executeCommand(
      executor,
      "task.create",
      { title: `任务 ${i}` },
      { now: () => NOW + i * 1000 },
    );
  }
});

describe("getTasksPage", () => {
  test("默认每页 200 条，25 条时一次取完且 hasMore=false", async () => {
    const page = await getTasksPage(executor);
    expect(page.tasks).toHaveLength(25);
    expect(page.hasMore).toBe(false);
  });

  test("limit 生效，hasMore=true 表示还有下一页", async () => {
    const page = await getTasksPage(executor, { limit: 10 });
    expect(page.tasks).toHaveLength(10);
    expect(page.hasMore).toBe(true);
  });

  test("offset 翻页不重复且能取到末页", async () => {
    const first = await getTasksPage(executor, { limit: 10, offset: 0 });
    const second = await getTasksPage(executor, { limit: 10, offset: 10 });
    const third = await getTasksPage(executor, { limit: 10, offset: 20 });

    const ids = new Set([...first.tasks, ...second.tasks, ...third.tasks].map((task) => task.id));
    expect(ids.size).toBe(25);
    expect(third.tasks).toHaveLength(5);
    expect(third.hasMore).toBe(false);
  });

  test("默认按最近改动排序（updated 倒序）", async () => {
    const page = await getTasksPage(executor, { limit: 3 });
    const updatedAts = page.tasks.map((task) => task.updatedAt);
    expect(updatedAts).toEqual([...updatedAts].sort((a, b) => b - a));
  });

  test("orderBy=order 按手动排序键", async () => {
    const page = await getTasksPage(executor, { limit: 5, orderBy: "order" });
    const keys = page.tasks.map((task) => task.orderKey);
    expect(keys).toEqual([...keys].sort());
  });

  test("墓碑任务不出现在分页结果里", async () => {
    const page = await getTasksPage(executor, { limit: 5 });
    const victim = page.tasks[0];
    expect(victim).toBeDefined();
    await executeCommand(executor, "task.softDelete", { id: victim!.id }, { now: () => NOW + 99_000 });

    const after = await getTasksPage(executor, { limit: 200 });
    expect(after.tasks.some((task) => task.id === victim!.id)).toBe(false);
    expect(after.tasks).toHaveLength(24);
  });

  test("limit 被夹到 1..2000", async () => {
    expect((await getTasksPage(executor, { limit: 0 })).tasks.length).toBeGreaterThan(0);
    const big = await getTasksPage(executor, { limit: 99999 });
    expect(big.tasks).toHaveLength(25);
  });
});

describe("countTasks", () => {
  test("统计未删除任务数", async () => {
    expect(await countTasks(executor)).toBe(25);
  });

  test("删除后计数下降", async () => {
    const page = await getTasksPage(executor, { limit: 1 });
    await executeCommand(executor, "task.softDelete", { id: page.tasks[0]!.id }, { now: () => NOW });
    expect(await countTasks(executor)).toBe(24);
  });
});

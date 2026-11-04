import { describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import { migrate } from "../db/migrations";
import type { TaggedRecord } from "../models/commands";
import type { Task } from "../models/task";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";
import { compareEntries, mergeOne } from "../sync/merge";

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime();

function taskRecord(id: string, revision = 1, updatedAt = NOW): TaggedRecord {
  const task: Task = {
    id,
    title: `任务 ${id}`,
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
    updatedAt,
    revision,
    deletedAt: null,
  };
  return { type: "task", record: task };
}

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

describe("merge · 最终决胜键", () => {
  test("revision 与 updatedAt 并列且 id 不同 → id 较小者胜，重复调用结果稳定", () => {
    const entryA = { revision: 1, updatedAt: NOW, deletedAt: null };
    const entryB = { revision: 1, updatedAt: NOW, deletedAt: null };
    expect(compareEntries(entryA, entryB, "a", "b")).toBeGreaterThan(0);
    expect(compareEntries(entryA, entryB, "b", "a")).toBeLessThan(0);
    expect(compareEntries(entryA, entryB, "a", "a")).toBe(0);

    const localB = taskRecord("b");
    const remoteA = taskRecord("a");
    const first = mergeOne(localB, remoteA);
    expect(first.localNeedsUpdate).toBe(true);
    expect(first.winner.record.id).toBe("a");

    const second = mergeOne(taskRecord("a"), taskRecord("b"));
    expect(second.localNeedsUpdate).toBe(false);
    expect(second.winner.record.id).toBe("a");

    const third = mergeOne(localB, remoteA);
    expect(third.localNeedsUpdate).toBe(true);
    expect(third.winner.record.id).toBe("a");
    expect(third).toEqual(first);
  });
});

describe("migrations · v4 索引与排序键回填", () => {
  test("从 v3 最小库升级：v4 索引与回填生效，版本继续推进到最新", async () => {
    const db = new Database(":memory:");
    const executor = makeExecutor(db);

    db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'inbox', order_key TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER)",
    );
    db.run("CREATE TABLE projects (id TEXT PRIMARY KEY, area_id TEXT)");
    db.run("INSERT INTO meta (key, value) VALUES (?, ?)", ["schema_version", "3"]);
    // 先插入的行 rowid=1，后插入的行 rowid=2
    db.run("INSERT INTO tasks (id, status, order_key, updated_at) VALUES (?, ?, ?, ?)", [
      "t2",
      "inbox",
      "custom",
      NOW,
    ]);
    db.run("INSERT INTO tasks (id, status, order_key, updated_at) VALUES (?, ?, ?, ?)", [
      "t1",
      "inbox",
      "",
      NOW,
    ]);

    const applied = await migrate(executor);
    // v4（索引 + 排序键回填）与 v5（task_templates）各一条
    expect(applied).toBe(2);

    const indexes = db
      .query("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as { name: string }[];
    const names = indexes.map((row) => row.name);
    expect(names).toContain("idx_tasks_order");
    expect(names).toContain("idx_tasks_updated");
    expect(names).toContain("idx_tasks_deleted");
    expect(names).toContain("idx_projects_area");

    const rows = db
      .query("SELECT id, order_key FROM tasks ORDER BY id")
      .all() as { id: string; order_key: string }[];
    expect(rows).toEqual([
      { id: "t1", order_key: "000000000000002" },
      { id: "t2", order_key: "custom" },
    ]);

    const version = db
      .query("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(version.value).toBe("5");

    db.close();
  });
});

import { beforeEach, describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import {
  clearNoteVersions,
  listNoteVersions,
  NOTE_VERSION_LIMIT,
  pushNoteVersion,
} from "../db/note-versions";
import { migrate } from "../db/migrations";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";

/**
 * 正文版本快照：用真实 SQLite（内存库）验证——
 * 写入、去重、裁剪上限、按任务隔离、清空。
 */

const TASK_A = "0192a4c1-7f3e-7abc-8def-00000000000a";
const TASK_B = "0192a4c1-7f3e-7abc-8def-00000000000b";
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
});

describe("pushNoteVersion", () => {
  test("首次写入返回版本并可按任务列出", async () => {
    const version = await pushNoteVersion(executor, TASK_A, "第一版正文", NOW);
    expect(version).not.toBeNull();
    expect(version?.wordCount).toBe(5);

    const list = await listNoteVersions(executor, TASK_A);
    expect(list).toHaveLength(1);
    expect(list[0]?.content).toBe("第一版正文");
  });

  test("空内容不记录（新建任务的空正文没有回滚价值）", async () => {
    expect(await pushNoteVersion(executor, TASK_A, "   ", NOW)).toBeNull();
    expect(await listNoteVersions(executor, TASK_A)).toHaveLength(0);
  });

  test("与最近一条内容相同则不重复记录", async () => {
    await pushNoteVersion(executor, TASK_A, "同一段", NOW);
    expect(await pushNoteVersion(executor, TASK_A, "同一段", NOW + 1000)).toBeNull();
    expect(await listNoteVersions(executor, TASK_A)).toHaveLength(1);
  });

  test("不同任务互不干扰", async () => {
    await pushNoteVersion(executor, TASK_A, "A 的正文", NOW);
    await pushNoteVersion(executor, TASK_B, "B 的正文", NOW);
    expect(await listNoteVersions(executor, TASK_A)).toHaveLength(1);
    expect(await listNoteVersions(executor, TASK_B)).toHaveLength(1);
    expect((await listNoteVersions(executor, TASK_A))[0]?.content).toBe("A 的正文");
  });

  test("按时间倒序返回（新的在前）", async () => {
    await pushNoteVersion(executor, TASK_A, "旧", NOW);
    await pushNoteVersion(executor, TASK_A, "新", NOW + 5000);
    const list = await listNoteVersions(executor, TASK_A);
    expect(list.map((item) => item.content)).toEqual(["新", "旧"]);
  });

  test(`超过 ${NOTE_VERSION_LIMIT} 条时裁掉最旧的`, async () => {
    for (let i = 0; i < NOTE_VERSION_LIMIT + 5; i += 1) {
      await pushNoteVersion(executor, TASK_A, `第 ${i} 版`, NOW + i * 1000);
    }
    const list = await listNoteVersions(executor, TASK_A);
    expect(list).toHaveLength(NOTE_VERSION_LIMIT);
    expect(list[0]?.content).toBe(`第 ${NOTE_VERSION_LIMIT + 4} 版`);
    expect(list.some((item) => item.content === "第 0 版")).toBe(false);
  });

  test("limit 参数可限制返回条数", async () => {
    await pushNoteVersion(executor, TASK_A, "一", NOW);
    await pushNoteVersion(executor, TASK_A, "二", NOW + 1000);
    expect(await listNoteVersions(executor, TASK_A, 1)).toHaveLength(1);
  });
});

describe("clearNoteVersions", () => {
  test("删除指定任务的全部历史，不影响其它任务", async () => {
    await pushNoteVersion(executor, TASK_A, "A1", NOW);
    await pushNoteVersion(executor, TASK_B, "B1", NOW);
    await clearNoteVersions(executor, TASK_A);
    expect(await listNoteVersions(executor, TASK_A)).toHaveLength(0);
    expect(await listNoteVersions(executor, TASK_B)).toHaveLength(1);
  });
});

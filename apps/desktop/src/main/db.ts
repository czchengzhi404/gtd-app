import Database from "better-sqlite3";
import type { SqliteExecutor } from "@gtd/core";

/**
 * 主进程 SQLite 执行器（better-sqlite3，N-API 预编译）。
 * 事务语义遵循 SqliteExecutor 端口契约：写事务 immediate（BEGIN IMMEDIATE
 * 在事务开始即取写锁，防用户命令与后台同步交错）；只读 deferred。
 * better-sqlite3 为同步驱动且主进程单线程：事务体内不得有宏任务等待
 * （core 命令实现仅同步 DB 调用，见 db/commands.ts 注释）。
 */
export interface SqliteHandle {
  executor: SqliteExecutor;
  close: () => void;
}

export function openSqlite(dbPath: string): SqliteHandle {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  const executor: SqliteExecutor = {
    query: async <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(info.changes) };
    },
    transaction: async <T>(
      fn: (tx: SqliteExecutor) => Promise<T>,
      mode: "immediate" | "deferred",
    ): Promise<T> => {
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
  return {
    executor,
    close: () => {
      db.close();
    },
  };
}

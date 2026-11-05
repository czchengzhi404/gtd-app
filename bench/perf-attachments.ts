import { Database, type SQLQueryBindings } from "bun:sqlite";

import { migrate } from "../packages/core/src/db/migrations.ts";
import { executeCommand } from "../packages/core/src/db/commands/index.ts";
import { collectLocalRecords } from "../packages/core/src/sync/service.ts";
import type { SqliteExecutor, SqliteRow } from "../packages/core/src/platform/executor.ts";

const NOW = Date.UTC(2026, 10, 5, 6, 0, 0);

function makeExecutor(db: Database): SqliteExecutor {
  const executor: SqliteExecutor = {
    query: async <T extends SqliteRow>(sql: string, params: readonly unknown[] = []) =>
      db.query(sql).all(...(params as SQLQueryBindings[])) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.run(sql, params as SQLQueryBindings[]);
      return { changes: info.changes };
    },
    transaction: async <T>(fn: (tx: SqliteExecutor) => Promise<T>, mode: "immediate" | "deferred") => {
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

const db = new Database(":memory:");
const executor = makeExecutor(db);
await migrate(executor);

const TASKS = 800;
const ATTACH_PER_TASK = 2;
const ids: string[] = [];
for (let i = 0; i < TASKS; i += 1) {
  const result = await executeCommand(
    executor,
    "task.create",
    { title: `任务 ${i}` },
    { now: () => NOW + i },
  );
  const id = result.ids[0];
  if (id !== undefined) ids.push(id);
}

for (const taskId of ids) {
  for (let a = 0; a < ATTACH_PER_TASK; a += 1) {
    await executeCommand(
      executor,
      "attachment.add",
      { taskId, fileName: `f${a}.png`, mimeType: "image/png", size: 1024, storagePath: `att/${a}.png` },
      { now: () => NOW },
    );
  }
}

console.log(`任务 ${TASKS} 条，附件 ${TASKS * ATTACH_PER_TASK} 条`);

for (let round = 0; round < 3; round += 1) {
  const start = performance.now();
  const records = await collectLocalRecords(executor);
  const ms = performance.now() - start;
  console.log(`collectLocalRecords #${round + 1}: ${ms.toFixed(1)} ms（${records.length} 条记录）`);
}

// 单独验证附件查询次数：统计 prepare 次数不可行，改为对比"一次全表查"的耗时
const start = performance.now();
const all = await executor.query<SqliteRow>("SELECT * FROM attachments WHERE deleted_at IS NULL");
console.log(`附件一次全表查: ${(performance.now() - start).toFixed(2)} ms（${all.length} 行）`);

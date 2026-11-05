import { Database, type SQLQueryBindings } from "bun:sqlite";

import { migrate } from "../packages/core/src/db/migrations.ts";
import { executeCommand } from "../packages/core/src/db/commands/index.ts";
import { collectLocalRecords } from "../packages/core/src/sync/service.ts";
import { totalBodyWords } from "../packages/core/src/features/writing-stats.ts";
import { countText } from "../packages/core/src/features/word-count.ts";
import { getTodayTasks, getMaterials } from "../packages/core/src/store/selectors/tasks.ts";
import { searchAll } from "../packages/core/src/features/search.ts";
import { computeStats } from "../packages/core/src/features/stats.ts";
import type { AppState } from "../packages/core/src/store/app-store.ts";
import type { SqliteExecutor, SqliteRow } from "../packages/core/src/platform/executor.ts";
import type { Task } from "../packages/core/src/models/task.ts";

const TASK_COUNT = 2000;
const BODY_CHARS = 800;
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

function timeIt(label: string, fn: () => unknown, iterations = 5): number {
  // 预热一次，避免 JIT 首次开销计入
  fn();
  const runs: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn();
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  const median = runs[Math.floor(runs.length / 2)] ?? 0;
  console.log(`${label.padEnd(34)} ${median.toFixed(2)} ms`);
  return median;
}

const body = "雨打在窗上，像一场没有人听的比喻。".repeat(Math.ceil(BODY_CHARS / 17)).slice(0, BODY_CHARS);

console.log(`== 纯函数（${TASK_COUNT} 条任务，每条正文 ${BODY_CHARS} 字）==`);

const tasks: Task[] = [];
for (let i = 0; i < TASK_COUNT; i += 1) {
  tasks.push({
    id: `0192a4c1-7f3e-7abc-8def-${String(i).padStart(12, "0")}`,
    createdAt: NOW - i * 1000,
    updatedAt: NOW - i * 500,
    revision: 1,
    deletedAt: null,
    title: i % 7 === 0 ? `写稿 第${i}篇` : `任务 ${i}`,
    notes: i % 3 === 0 ? body : "",
    status: i % 5 === 0 ? "someday" : i % 3 === 0 ? "done" : "next",
    priority: (i % 4) as 0 | 1 | 2 | 3,
    deferUntil: null,
    dueAt: i % 10 === 0 ? NOW + i * 60_000 : null,
    completedAt: null,
    lastCompletedAt: null,
    projectId: null,
    sectionId: null,
    contextIds: [],
    tags: i % 6 === 0 ? ["素材"] : [],
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: String(i).padStart(10, "0"),
  });
}

const state: AppState = {
  loaded: true,
  tasks: Object.fromEntries(tasks.map((task) => [task.id, task])),
  projects: {},
  sections: {},
  contexts: {},
  areas: {},
  templates: {},
  kv: {},
  lastError: null,
};

const longBody = body.repeat(12); // ≈9600 字

timeIt("countText（9600 字正文）", () => countText(longBody), 20);
timeIt("totalBodyWords（全库）", () => totalBodyWords(tasks));
timeIt("getTodayTasks", () => getTodayTasks(state, NOW));
timeIt("getMaterials", () => getMaterials(state));
timeIt("searchAll('雨')", () => searchAll(state, "雨", NOW));
timeIt("searchAll('雨 比喻')", () => searchAll(state, "雨 比喻", NOW));
timeIt("computeStats", () => computeStats(state, NOW));

console.log("\n== 数据层（真实 SQLite）==");
const db = new Database(":memory:");
const executor = makeExecutor(db);
await migrate(executor);

const SEED = 1200;
const seedStart = performance.now();
for (let i = 0; i < SEED; i += 1) {
  await executeCommand(
    executor,
    "task.create",
    { title: `任务 ${i}`, notes: i % 4 === 0 ? body : "" },
    { now: () => NOW + i },
  );
}
console.log(`插入 ${SEED} 条任务                        ${(performance.now() - seedStart).toFixed(0)} ms`);

timeIt("collectLocalRecords（含附件 N+1）", () => collectLocalRecords(executor), 3);

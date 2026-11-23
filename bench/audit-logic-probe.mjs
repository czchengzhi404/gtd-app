/**
 * 逻辑审计探针（可重复运行）：逐条打印已确认的逻辑缺陷。
 *
 * 为什么是脚本而不是 bun test：这些断言描述的是**当前错误行为**，
 * 放进测试套件会让 530 项全绿变红。等缺陷修好后，应把它们搬进
 * 对应模块的 __tests__ 并反转期望值。
 *
 * 用法：bun bench/audit-logic-probe.mjs
 */
import Database from "better-sqlite3";

import { nextOccurrence } from "../packages/core/src/features/recurrence";
import { pickNextAction } from "../packages/core/src/features/next-action";
import { unresolvedPrereqs } from "../packages/core/src/features/dependencies";
import { buildReviewSummary } from "../packages/core/src/features/review";
import { computeStats } from "../packages/core/src/features/stats";
import { coerceTask } from "../packages/core/src/db/coerce";
import { migrate, executeCommand, getTaskById } from "../packages/core/src/index";

const DAY = 86_400_000;
const results = [];
function report(name, buggy, detail) {
  results.push({ name, buggy, detail });
  console.log(`${buggy ? "BUG " : "OK  "} ${name}\n      ${detail}`);
}

/* ---------- 1. weekly interval 被忽略 ---------- */
{
  const mon = new Date(2026, 10, 2, 9, 0, 0).getTime();
  const seq = (interval) => {
    let anchor = mon;
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      const next = nextOccurrence(anchor, { freq: "weekly", interval, byWeekday: [1] }, anchor);
      if (next === null) break;
      out.push(new Date(next).getDate());
      anchor = next;
    }
    return out;
  };
  const one = seq(1);
  const two = seq(2);
  report(
    "weekly interval>1 与 interval=1 结果相同（每月日号序列）",
    JSON.stringify(one) === JSON.stringify(two),
    `interval=1 → ${one.join(",")}；interval=2 → ${two.join(",")}（每两周应隔 14 天）`,
  );
}

/* ---------- 2. 已删除前置永久挡住首屏 ---------- */
{
  const now = new Date(2026, 10, 2, 10, 0, 0).getTime();
  const base = {
    notes: "", status: "inbox", priority: 0, deferUntil: null, dueAt: null,
    completedAt: null, lastCompletedAt: null, projectId: null, sectionId: null,
    contextIds: [], tags: [], blockedBy: [], waitingFor: null, starred: false,
    recurrence: null, checklist: [], orderKey: "0", createdAt: now, updatedAt: now,
    revision: 1, deletedAt: null,
  };
  const prereq = { ...base, id: "p1", title: "前置", deletedAt: now };
  const dependent = { ...base, id: "d1", title: "依赖它的任务", blockedBy: ["p1"] };
  const tasks = [prereq, dependent];
  const r = pickNextAction(tasks, now);
  const detail = unresolvedPrereqs(dependent, tasks);
  report(
    "软删前置后：首屏不可做，但详情页显示无前置",
    r.next === null && detail.length === 0,
    `首屏 next=${r.next?.title ?? "null"}，blockedCount=${r.blockedCount}；详情 unresolvedPrereqs=${detail.length} 条`,
  );
}

/* ---------- 3/4. 撤销语义（真实 SQLite） ---------- */
{
  const db = new Database(":memory:");
  const executor = {
    query: async (sql, params = []) => db.prepare(sql).all(...params),
    run: async (sql, params = []) => ({ changes: db.prepare(sql).run(...params).changes }),
    transaction: async (fn, mode) => {
      db.exec(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const out = await fn(executor);
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
  const NOW = new Date(2026, 9, 24, 10, 0, 0).getTime();
  const ctx = { now: () => NOW };
  await migrate(executor);

  // 3. waiting → done → uncomplete（调用方带上完成前快照，与 app 真实路径一致）
  const a = await executeCommand(executor, "task.create", { title: "等回复", status: "waiting" }, ctx);
  const waitingId = a.records[0].record.id;
  const waitingBefore = a.records[0].record;
  await executeCommand(executor, "task.complete", { id: waitingId }, ctx);
  await executeCommand(
    executor,
    "task.uncomplete",
    {
      id: waitingId,
      restore: {
        status: waitingBefore.status,
        dueAt: waitingBefore.dueAt,
        lastCompletedAt: waitingBefore.lastCompletedAt,
      },
    },
    ctx,
  );
  const afterWaiting = await getTaskById(executor, waitingId);
  report(
    "waiting 任务完成再撤销后状态变成 inbox",
    afterWaiting.status !== "waiting",
    `原状态 waiting → 撤销后 ${afterWaiting.status}`,
  );

  // 4. recurring → done → uncomplete（同上）
  const dueAt = NOW + DAY;
  const b = await executeCommand(
    executor,
    "task.create",
    { title: "每天喝水", dueAt, recurrence: { freq: "daily", interval: 1, until: null } },
    ctx,
  );
  const recurringId = b.records[0].record.id;
  const recurringBefore = b.records[0].record;
  await executeCommand(executor, "task.complete", { id: recurringId }, ctx);
  await executeCommand(
    executor,
    "task.uncomplete",
    {
      id: recurringId,
      restore: {
        status: recurringBefore.status,
        dueAt: recurringBefore.dueAt,
        lastCompletedAt: recurringBefore.lastCompletedAt,
      },
    },
    ctx,
  );
  const afterRecurring = await getTaskById(executor, recurringId);
  report(
    "重复任务撤销后到期日没有回退",
    afterRecurring.dueAt !== dueAt || afterRecurring.lastCompletedAt !== null,
    `原 dueAt=${new Date(dueAt).toLocaleString("zh-CN")}，撤销后=${new Date(afterRecurring.dueAt).toLocaleString("zh-CN")}，lastCompletedAt=${afterRecurring.lastCompletedAt}`,
  );
}

/* ---------- 5. 同步/导入丢 byWeekday ---------- */
{
  const input = { id: "t1", title: "每周一三", recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3], until: null } };
  const out = coerceTask(input);
  report(
    "coerceTask 丢弃 byWeekday（同步/恢复备份后每周多日规则消失）",
    out.recurrence.byWeekday === undefined,
    `输入 [1,3] → 输出 ${JSON.stringify(out.recurrence.byWeekday)}；同文件 asRecurrence（模板路径）是正确实现`,
  );
}

/* ---------- 6. 回顾与统计口径不一致 ---------- */
{
  const now = new Date(2026, 10, 23, 10, 0, 0).getTime();
  const base = {
    notes: "", status: "inbox", priority: 0, deferUntil: null, dueAt: null,
    completedAt: null, projectId: null, sectionId: null, contextIds: [], tags: [],
    blockedBy: [], waitingFor: null, starred: false, checklist: [], orderKey: "0",
    createdAt: now - 3 * DAY, updatedAt: now, revision: 1, deletedAt: null,
  };
  const recurring = {
    ...base, id: "r1", title: "每天喝水",
    recurrence: { freq: "daily", interval: 1, until: null }, lastCompletedAt: now - 3_600_000,
  };
  const state = { loaded: true, tasks: { r1: recurring }, projects: {}, sections: {}, areas: {}, contexts: {}, templates: {}, kv: {}, lastError: null };
  const review = buildReviewSummary(state, now);
  const stats = computeStats(state, now);
  report(
    "同一库：回顾页 7 天完成数 ≠ 统计页 7 天完成数（重复任务被回顾漏计）",
    review.completedLastWeek !== stats.completed7d,
    `review.completedLastWeek=${review.completedLastWeek}，stats.completed7d=${stats.completed7d}`,
  );
}

const bugs = results.filter((r) => r.buggy).length;
console.log(`\n确认缺陷 ${bugs}/${results.length} 项`);
process.exitCode = bugs > 0 ? 1 : 0;

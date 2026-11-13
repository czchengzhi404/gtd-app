/**
 * 「现在该做的一件事」——从一堆任务里挑出唯一该被看见的那一件。
 *
 * 参考 NextTodo 的核心主张：设好先后，只看现在能做的事。
 * 规则（按顺序，先命中者胜）：
 *   1. 排除：已完成、已软删、被推迟到未来（deferUntil > now）
 *   2. 排除：还有未完成前置（blockedBy 里任一任务未完成）——这正是「先后关系」
 *   3. 优先：已逾期（dueAt < now）里 dueAt 最早的
 *   4. 其次：今天到期（dueAt 落在今天内）里 dueAt 最早的
 *   5. 再次：有 dueAt 的里最早的
 *   6. 其余：按 orderKey 字典序（与列表展示顺序一致），优先级高者靠前
 *
 * 纯函数、不碰日期库、now 由调用方注入（方便测试）。
 */
import type { Task } from "../models/task";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 本地时区的当天 00:00 */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface NextActionResult {
  /** 现在该做的那一件；没有任何可做事项时为 null */
  next: Task | null;
  /** 其余可做事项（不含 next），已按展示顺序排好 */
  rest: Task[];
  /** 因为「前置未完成」而被挡住的事项数（给用户一个「还有 N 件在等着」的交代） */
  blockedCount: number;
  /** 可做事项总数（含 next） */
  availableCount: number;
}

export function pickNextAction(tasks: readonly Task[], now: number): NextActionResult {
  const alive = tasks.filter(
    (t) => t.deletedAt === null && t.status !== "done" && (t.deferUntil === null || t.deferUntil <= now),
  );

  // 已完成 / 已删除的 id 集合：前置指向它们时视为「已满足」
  const doneIds = new Set(
    tasks.filter((t) => t.status === "done" && t.deletedAt === null).map((t) => t.id),
  );

  const available: Task[] = [];
  let blockedCount = 0;
  for (const task of alive) {
    const waiting = task.blockedBy.some((id) => !doneIds.has(id));
    if (waiting) blockedCount += 1;
    else available.push(task);
  }

  const dayStart = startOfDay(now);
  const dayEnd = dayStart + DAY_MS;

  /** 排序键：越小越该先做 */
  const rank = (t: Task): number => {
    if (t.dueAt !== null && t.dueAt < now) return 0 + (t.dueAt - now) / 1e13; // 逾期：越早越前
    if (t.dueAt !== null && t.dueAt < dayEnd) return 1 + (t.dueAt - dayStart) / 1e13; // 今天
    if (t.dueAt !== null) return 2 + (t.dueAt - dayEnd) / 1e13; // 未来
    return 3; // 无日期
  };

  const sorted = [...available].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    // 同级：有优先级的（1/2/3）压过无优先级（0）；数字小者更紧急
    const pa = a.priority === 0 ? 99 : a.priority;
    const pb = b.priority === 0 ? 99 : b.priority;
    if (pa !== pb) return pa - pb;
    return a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;
  });

  return {
    next: sorted[0] ?? null,
    rest: sorted.slice(1),
    blockedCount,
    availableCount: sorted.length,
  };
}

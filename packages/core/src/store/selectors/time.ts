import type { Task } from "../../models/task";

/**
 * 日期边界与任务排序的共享原语。
 * 全部使用本地时区（与 UI 展示、quick-add 解析保持一致）。
 */

export function startOfDayOf(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDayOf(now: number): number {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** 手动排序优先；同一 orderKey 时按创建时间（保持既有排序语义） */
export function byOrder(a: Task, b: Task): number {
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/** 是否尚未到开始日期（defer）：到了之前不该出现在任何"可执行"视图 */
export function isDeferred(task: Task, now: number): boolean {
  return task.deferUntil !== null && task.deferUntil > now;
}

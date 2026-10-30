import type { Task } from "../models/task";
import { endOfDay } from "./recurrence";

/**
 * 到期扫描（通知的数据源，纯函数）：找出"今天内到期或已逾期、未完成、
 * 且尚未通知过"的任务。去重键 = `${taskId}:${dueAt}`（dueAt 变化即重新提醒）。
 */

export interface DueNotification {
  taskId: string;
  title: string;
  dueAt: number;
}

export interface DueScanResult {
  due: DueNotification[];
  /** 本次扫描新增的通知键（调用方写入 kv，供下次去重） */
  newKeys: string[];
}

export const DUE_NOTIFY_LIMIT = 5;

/** 任务级时间提醒的触发窗口（毫秒）：到点后 5 分钟内提醒一次 */
export const TIMED_NOTIFY_WINDOW_MS = 5 * 60 * 1000;

/**
 * 任务级时间提醒：到期时间带具体时刻（非默认 18:00）且已到点、
 * 在窗口内、未完成的任务。去重键 `timed.<id>:<dueAt>`。
 *
 * 与 pickDueNotifications 的区别：后者是"今天到期"的每日概览，
 * 这里精确到时刻——用户说"下午 3 点提醒我打电话"就靠它。
 */
export function pickTimedNotifications(
  tasks: Task[],
  now: number,
  notifiedKeys: Set<string>,
): DueScanResult {
  const due: DueNotification[] = [];
  const newKeys: string[] = [];
  for (const task of tasks) {
    if (task.status === "done" || task.deletedAt !== null) continue;
    if (task.dueAt === null) continue;
    if (task.dueAt > now) continue;
    if (now - task.dueAt > TIMED_NOTIFY_WINDOW_MS) continue;
    const d = new Date(task.dueAt);
    if (d.getHours() === 18 && d.getMinutes() === 0) continue; // 仅日期，交给每日概览
    const key = `timed.${task.id}:${task.dueAt}`;
    if (notifiedKeys.has(key)) continue;
    if (due.length >= DUE_NOTIFY_LIMIT) continue;
    due.push({ taskId: task.id, title: task.title, dueAt: task.dueAt });
    newKeys.push(key);
  }
  return { due, newKeys };
}

export function pickDueNotifications(
  tasks: Task[],
  now: number,
  notifiedKeys: Set<string>,
): DueScanResult {
  const horizon = endOfDay(now);
  const due: DueNotification[] = [];
  const newKeys: string[] = [];
  for (const task of tasks) {
    if (task.status === "done" || task.deletedAt !== null) continue;
    if (task.dueAt === null || task.dueAt > horizon) continue;
    const key = `${task.id}:${task.dueAt}`;
    if (notifiedKeys.has(key)) continue;
    if (due.length >= DUE_NOTIFY_LIMIT) continue;
    due.push({ taskId: task.id, title: task.title, dueAt: task.dueAt });
    newKeys.push(key);
  }
  return { due, newKeys };
}

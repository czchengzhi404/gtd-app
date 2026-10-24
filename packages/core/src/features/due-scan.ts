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

import type { Task } from "../../models/task";
import type { AppState } from "../app-store";
import { liveTasks } from "./tasks";
import { byOrder, startOfDayOf } from "./time";

/* ---------------- 搜索与筛选 ---------------- */

export interface ListFilter {
  /** 关键词（标题/笔记/标签，忽略大小写） */
  query?: string;
  /** 情境筛选（null/undefined = 不限） */
  contextId?: string | null;
  /** 标签筛选 */
  tag?: string | null;
  /** 只看逾期 */
  overdueOnly?: boolean;
}

/** 所有在用标签（去重、排序）；大小写视作同一标签，保留首见写法 */
export function getAllTags(state: AppState): string[] {
  const seen = new Map<string, string>();
  for (const task of liveTasks(state)) {
    for (const tag of task.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

/** 对任意任务集合应用搜索 + 情境 + 逾期筛选（纯函数） */
export function applyListFilter(tasks: Task[], filter: ListFilter, now: number): Task[] {
  const query = (filter.query ?? "").trim().toLowerCase();
  const dayStart = startOfDayOf(now);
  return tasks.filter((task) => {
    if (query.length > 0) {
      const haystack = `${task.title}\n${task.notes}\n${task.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filter.contextId !== undefined && filter.contextId !== null) {
      if (!task.contextIds.includes(filter.contextId)) return false;
    }
    if (filter.tag !== undefined && filter.tag !== null) {
      if (!task.tags.includes(filter.tag)) return false;
    }
    if (filter.overdueOnly === true) {
      if (task.dueAt === null || task.dueAt >= dayStart || task.status === "done") return false;
    }
    return true;
  });
}

/** 全局搜索（所有未删除任务，含已完成） */
export function searchTasks(state: AppState, query: string): Task[] {
  return applyListFilter(liveTasks(state), { query }, Date.now()).sort(byOrder);
}

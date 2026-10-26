import type { Task, TaskStatus } from "../models/task";
import type { AppState } from "./app-store";

/**
 * GTD 派生选择器（纯函数，无 React 依赖）。
 * 视图语义：
 * - 收集箱：status=inbox
 * - 今天：dueAt ≤ 今天结束 且未完成（含逾期）
 * - 专注：今日到期 ∪ 已选中的下一步行动（starred），starred 优先
 * - 等待中 / 将来·也许：对应 status
 * - 项目：projectTasks；顺序项目取第一个未完成项作为下一步行动
 */

function byOrder(a: Task, b: Task): number {
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
  return a.createdAt - b.createdAt;
}

function liveTasks(state: AppState): Task[] {
  return Object.values(state.tasks).filter((t) => t.deletedAt === null);
}

export function getTasksByStatus(state: AppState, status: TaskStatus): Task[] {
  return liveTasks(state)
    .filter((t) => t.status === status)
    .sort(byOrder);
}

export function getInboxTasks(state: AppState): Task[] {
  return getTasksByStatus(state, "inbox");
}

export function getWaitingTasks(state: AppState): Task[] {
  return getTasksByStatus(state, "waiting");
}

export function getSomedayTasks(state: AppState): Task[] {
  return getTasksByStatus(state, "someday");
}

export function getTodayTasks(state: AppState, now: number): Task[] {
  const end = endOfDayOf(now);
  return liveTasks(state)
    .filter((t) => t.status !== "done" && t.dueAt !== null && t.dueAt <= end)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

export function getFocusTasks(state: AppState, now: number): Task[] {
  const end = endOfDayOf(now);
  const today = liveTasks(state).filter(
    (t) => t.status !== "done" && t.dueAt !== null && t.dueAt <= end,
  );
  const starred = liveTasks(state).filter((t) => t.starred && t.status !== "done");
  const seen = new Set<string>();
  const merged: Task[] = [];
  for (const t of [...starred.sort(byOrder), ...today.sort(byOrder)]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  return merged;
}

export function getProjectTasks(state: AppState, projectId: string): Task[] {
  return liveTasks(state)
    .filter((t) => t.projectId === projectId)
    .sort(byOrder);
}

export function getProjectNextAction(state: AppState, projectId: string): Task | null {
  const tasks = getProjectTasks(state, projectId).filter((t) => t.status !== "done");
  if (tasks.length === 0) return null;
  const project = state.projects[projectId];
  if (project && project.kind === "sequential") {
    return tasks[0] ?? null;
  }
  // 并行项目：任一未完成项都可作为下一步；优先已推进到 next 的
  return tasks.find((t) => t.status === "next") ?? tasks[0] ?? null;
}

export function selectActiveProjects(state: AppState) {
  return Object.values(state.projects)
    .filter((p) => p.deletedAt === null && p.status === "active")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function selectContexts(state: AppState) {
  return Object.values(state.contexts)
    .filter((c) => c.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function selectTaskById(state: AppState, id: string): Task | null {
  const task = state.tasks[id];
  return task && task.deletedAt === null ? task : null;
}

/* ---------------- 搜索与筛选 ---------------- */

export interface ListFilter {
  /** 关键词（标题/笔记，忽略大小写） */
  query?: string;
  /** 情境筛选（null/undefined = 不限） */
  contextId?: string | null;
  /** 只看逾期 */
  overdueOnly?: boolean;
}

/** 对任意任务集合应用搜索 + 情境 + 逾期筛选（纯函数） */
export function applyListFilter(tasks: Task[], filter: ListFilter, now: number): Task[] {
  const q = (filter.query ?? "").trim().toLowerCase();
  const dayStart = startOfDayOf(now);
  return tasks.filter((task) => {
    if (q.length > 0) {
      const hay = `${task.title}\n${task.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter.contextId !== undefined && filter.contextId !== null) {
      if (!task.contextIds.includes(filter.contextId)) return false;
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

function startOfDayOf(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayOf(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

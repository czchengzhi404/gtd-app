import type { Task, TaskStatus } from "../../models/task";
import type { AppState } from "../app-store";
import { byOrder, endOfDayOf, isDeferred, startOfDayOf } from "./time";

/**
 * 任务视图选择器（纯函数）。
 * 视图语义：
 * - 收集箱：status=inbox
 * - 今天：dueAt ≤ 今天结束 且未完成（含逾期）
 * - 专注：今日到期 ∪ 已选中的下一步行动（starred），starred 优先
 * - 等待中 / 将来·也许：对应 status
 * - 项目：projectTasks；顺序项目取第一个未完成项作为下一步行动
 */

export function liveTasks(state: AppState): Task[] {
  return Object.values(state.tasks).filter((task) => task.deletedAt === null);
}

export function getTasksByStatus(state: AppState, status: TaskStatus): Task[] {
  return liveTasks(state)
    .filter((task) => task.status === status)
    .sort(byOrder);
}

/** 收集箱：未到开始日期的任务不显示（避免"现在还不该看到"的干扰） */
export function getInboxTasks(state: AppState, now: number = Date.now()): Task[] {
  return getTasksByStatus(state, "inbox").filter((task) => !isDeferred(task, now));
}

export function getWaitingTasks(state: AppState, now: number = Date.now()): Task[] {
  return getTasksByStatus(state, "waiting").filter((task) => !isDeferred(task, now));
}

export function getSomedayTasks(state: AppState): Task[] {
  return getTasksByStatus(state, "someday");
}

/**
 * 素材库：someday 状态的条目，按最近改动排序。
 *
 * 为什么复用 someday 而不新建实体：写作者的"素材"就是"还没决定用在哪儿的东西"，
 * 与 GTD 的 someday 语义一致。新建独立实体要动 schema/命令/同步/合并四层，
 * 而现有模型已经能承载（正文 + 标签 + 来源）。
 * 顺序按 updatedAt 倒序——刚记下的素材通常最相关。
 */
/**
 * 全部任务（含已完成、含墓碑）的稳定数组。
 *
 * 为什么不直接 `Object.values(state.tasks)`：那每次都返回**新数组**，
 * zustand 用 Object.is 比较快照 → 任何 store 变化都被判成"变了"，
 * 列表与派生计算无法被 memo 命中。这里按 `state.tasks` 的对象引用缓存：
 * 同一快照多次调用返回同一数组，store 真变了才重新求值。
 */
const allTasksCache = new WeakMap<Record<string, Task>, Task[]>();

export function getAllTasks(state: AppState): Task[] {
  const cached = allTasksCache.get(state.tasks);
  if (cached !== undefined) return cached;
  const list = Object.values(state.tasks);
  allTasksCache.set(state.tasks, list);
  return list;
}

export function getMaterials(state: AppState): Task[] {
  return getTasksByStatus(state, "someday").sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getTodayTasks(state: AppState, now: number): Task[] {
  const end = endOfDayOf(now);
  return liveTasks(state)
    .filter(
      (task) =>
        task.status !== "done" &&
        task.dueAt !== null &&
        task.dueAt <= end &&
        !isDeferred(task, now),
    )
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

/* ---------------- 未来视图（Upcoming） ---------------- */

export interface UpcomingGroup {
  key: string;
  /** 天起点（毫秒），用于显示与排序 */
  dayStart: number;
  tasks: Task[];
}

/**
 * 未来 N 天按日分组的到期任务（不含今天之前、不含已完成、不含未到开始日期的）。
 * 与日历/Timeline 的区别：不依赖月视图或宽屏，任何时候都能用。
 */
export function getUpcomingGroups(state: AppState, now: number, days = 14): UpcomingGroup[] {
  const today = startOfDayOf(now);
  const horizon = today + days * 86_400_000;
  const buckets = new Map<number, Task[]>();

  for (const task of liveTasks(state)) {
    if (task.status === "done" || task.dueAt === null) continue;
    if (task.dueAt < today + 86_400_000) continue; // 今天的在"今天"视图
    if (task.dueAt >= horizon) continue;
    if (isDeferred(task, now)) continue;
    const dayStart = startOfDayOf(task.dueAt);
    const list = buckets.get(dayStart) ?? [];
    list.push(task);
    buckets.set(dayStart, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayStart, tasks]) => ({
      key: String(dayStart),
      dayStart,
      tasks: tasks.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    }));
}

export function getFocusTasks(state: AppState, now: number): Task[] {
  const end = endOfDayOf(now);
  const today = liveTasks(state).filter(
    (task) =>
      task.status !== "done" &&
      task.dueAt !== null &&
      task.dueAt <= end &&
      !isDeferred(task, now),
  );
  const starred = liveTasks(state).filter(
    (task) => task.starred && task.status !== "done" && !isDeferred(task, now),
  );
  const seen = new Set<string>();
  const merged: Task[] = [];
  for (const task of [...starred.sort(byOrder), ...today.sort(byOrder)]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }
  return merged;
}

export function getProjectTasks(
  state: AppState,
  projectId: string,
  now: number = Date.now(),
): Task[] {
  return liveTasks(state)
    .filter((task) => task.projectId === projectId)
    .filter((task) => task.status === "done" || !isDeferred(task, now))
    .sort(byOrder);
}

export function getProjectNextAction(state: AppState, projectId: string): Task | null {
  const tasks = getProjectTasks(state, projectId).filter((task) => task.status !== "done");
  if (tasks.length === 0) return null;
  const project = state.projects[projectId];
  if (project && project.kind === "sequential") {
    return tasks[0] ?? null;
  }
  // 并行项目：任一未完成项都可作为下一步；优先已推进到 next 的
  return tasks.find((task) => task.status === "next") ?? tasks[0] ?? null;
}

export function selectTaskById(state: AppState, id: string): Task | null {
  const task = state.tasks[id];
  return task && task.deletedAt === null ? task : null;
}

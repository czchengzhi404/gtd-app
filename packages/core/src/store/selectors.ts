import type { Area, Project, Task, TaskStatus } from "../models/task";
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

/** 是否尚未到开始日期（defer）：到了之前不该出现在任何"可执行"视图 */
export function isDeferred(task: Task, now: number): boolean {
  return task.deferUntil !== null && task.deferUntil > now;
}

export function getTasksByStatus(state: AppState, status: TaskStatus): Task[] {
  return liveTasks(state)
    .filter((t) => t.status === status)
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

export function getTodayTasks(state: AppState, now: number): Task[] {
  const end = endOfDayOf(now);
  return liveTasks(state)
    .filter(
      (t) =>
        t.status !== "done" &&
        t.dueAt !== null &&
        t.dueAt <= end &&
        !isDeferred(t, now),
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
  const horizon = today + days * 86400000;
  const buckets = new Map<number, Task[]>();

  for (const task of liveTasks(state)) {
    if (task.status === "done" || task.dueAt === null) continue;
    if (task.dueAt < today + 86400000) continue; // 今天的在"今天"视图
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
    (t) => t.status !== "done" && t.dueAt !== null && t.dueAt <= end && !isDeferred(t, now),
  );
  const starred = liveTasks(state).filter(
    (t) => t.starred && t.status !== "done" && !isDeferred(t, now),
  );
  const seen = new Set<string>();
  const merged: Task[] = [];
  for (const t of [...starred.sort(byOrder), ...today.sort(byOrder)]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  return merged;
}

export function getProjectTasks(state: AppState, projectId: string, now: number = Date.now()): Task[] {
  return liveTasks(state)
    .filter((t) => t.projectId === projectId)
    .filter((t) => t.status === "done" || !isDeferred(t, now))
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

/** 区域列表 */
export function selectAreas(state: AppState): Area[] {
  return Object.values(state.areas)
    .filter((area) => area.deletedAt === null)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
}

/**
 * 按区域分组活跃项目；未归类的进 null 组（殿后）。
 * 纯数组入参版：React 侧应配 useMemo 使用（见下 selectProjectsByArea 的注意）。
 */
export function groupProjectsByArea(
  areas: Area[],
  projects: Project[],
  allAreas: Record<string, Area>,
): { area: Area | null; projects: Project[] }[] {
  const groups = areas.map((area) => ({
    area,
    projects: projects.filter((project) => project.areaId === area.id),
  }));
  const loose = projects.filter((project) => {
    if (project.areaId === null) return true;
    const area = allAreas[project.areaId];
    // 区域被删（墓碑）或缺失时，项目回落未分组，不能凭空消失
    return area === undefined || area.deletedAt !== null;
  });
  return [...groups, { area: null, projects: loose }].filter(
    (group) => group.projects.length > 0 || group.area !== null,
  );
}

/**
 * 按区域分组的活跃项目（state 版，测试/一次性调用用）。
 * ⚠️ 不要直接传给 useAppStore/useShallow：每次调用都返回新的分组对象，
 * 浅比较恒不相等会触发 React "Maximum update depth exceeded"（#185）。
 * React 里请用 selectAreas + selectActiveProjects + groupProjectsByArea + useMemo。
 */
export function selectProjectsByArea(
  state: AppState,
): { area: Area | null; projects: Project[] }[] {
  return groupProjectsByArea(selectAreas(state), selectActiveProjects(state), state.areas);
}

/** 对任意任务集合应用搜索 + 情境 + 逾期筛选（纯函数） */
export function applyListFilter(tasks: Task[], filter: ListFilter, now: number): Task[] {
  const q = (filter.query ?? "").trim().toLowerCase();
  const dayStart = startOfDayOf(now);
  return tasks.filter((task) => {
    if (q.length > 0) {
      const hay = `${task.title}\n${task.notes}\n${task.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
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

import type { Project, Task } from "../models/task";

/**
 * 艾森豪威尔矩阵（重要性 × 紧急性）。
 *
 * 重要 = priority >= 2 或 starred 或（有 dueAt 且属于活跃项目）。
 * 紧急 = dueAt 距今 <= 48h（含逾期）。
 *
 * `projects` 可选：提供时按项目 id 查活跃性（deletedAt === null 且
 * status === "active"）；不提供时把非空 projectId 视为项目成员
 * （调用方通常已传入活跃项目任务）。
 */

export const QUADRANTS = ["q1", "q2", "q3", "q4"] as const;

export type Quadrant = (typeof QUADRANTS)[number];

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  q1: "重要且紧急",
  q2: "重要不紧急",
  q3: "紧急不重要",
  q4: "既不重要也不紧急",
};

export const URGENT_WINDOW_MS = 48 * 60 * 60 * 1000;

function isActiveProject(
  task: Task,
  projects?: Record<string, Project> | null,
): boolean {
  if (task.projectId === null) return false;
  if (projects === undefined || projects === null) return true;
  const project = projects[task.projectId];
  return project !== undefined && project.deletedAt === null && project.status === "active";
}

export function isImportant(
  task: Task,
  projects?: Record<string, Project> | null,
): boolean {
  if (task.priority >= 2) return true;
  if (task.starred) return true;
  return task.dueAt !== null && isActiveProject(task, projects);
}

export function isUrgent(task: Task, now: number): boolean {
  return task.dueAt !== null && task.dueAt - now <= URGENT_WINDOW_MS;
}

export function classifyQuadrant(
  task: Task,
  now: number,
  projects?: Record<string, Project> | null,
): Quadrant {
  const important = isImportant(task, projects);
  const urgent = isUrgent(task, now);
  if (important && urgent) return "q1";
  if (important) return "q2";
  if (urgent) return "q3";
  return "q4";
}

/** 固定顺序 q1..q4，空组也返回空数组（UI 不需要额外兜底） */
export function groupByQuadrant(
  tasks: Task[],
  now: number,
  projects?: Record<string, Project> | null,
): Record<Quadrant, Task[]> {
  const groups: Record<Quadrant, Task[]> = { q1: [], q2: [], q3: [], q4: [] };
  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    groups[classifyQuadrant(task, now, projects)].push(task);
  }
  return groups;
}

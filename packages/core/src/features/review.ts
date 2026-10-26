import type { AppState } from "../store/app-store";
import { getInboxTasks, getProjectNextAction, getSomedayTasks, getWaitingTasks, selectActiveProjects } from "../store/selectors";
import { endOfDay, startOfDay } from "./recurrence";

/**
 * 每周回顾摘要（纯函数）：向导六个步骤的数据源。
 * 步骤：清空收集箱 → 检查项目（无下一步行动的项目）→ 回顾日程 →
 *       更新等待中 → 将来/也许 → 完成并记录 review.lastAt。
 */

export interface ReviewProjectIssue {
  projectId: string;
  name: string;
  kind: "sequential" | "parallel";
}

export interface ReviewSummary {
  inboxCount: number;
  inboxSample: { id: string; title: string }[];
  projectsWithoutNext: ReviewProjectIssue[];
  /** 过去 7 天完成任务数 */
  completedLastWeek: number;
  /** 未来 14 天（含今天）到期任务数 */
  upcomingCount: number;
  waitingCount: number;
  waitingSample: { id: string; title: string; waitingFor: string | null }[];
  somedayCount: number;
  /** 最近 8 周（含本周）完成数，按时间正序 */
  weeklyCompletion: number[];
  /** 超过 14 天没有任何任务变动的活跃项目 */
  staleProjects: { projectId: string; name: string; days: number }[];
  /** 已完成 / 总任务（不含墓碑） */
  doneCount: number;
  openCount: number;
}

export function buildReviewSummary(state: AppState, now: number): ReviewSummary {
  const inbox = getInboxTasks(state);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const horizon = endOfDay(now + 14 * 24 * 60 * 60 * 1000);

  let completedLastWeek = 0;
  let upcomingCount = 0;
  for (const task of Object.values(state.tasks)) {
    if (task.deletedAt !== null) continue;
    if (task.status === "done" && task.completedAt !== null && task.completedAt >= startOfDay(weekAgo)) {
      completedLastWeek++;
    }
    if (task.status !== "done" && task.dueAt !== null && task.dueAt >= startOfDay(now) && task.dueAt <= horizon) {
      upcomingCount++;
    }
  }

  const projectsWithoutNext: ReviewProjectIssue[] = [];
  for (const project of selectActiveProjects(state)) {
    if (getProjectNextAction(state, project.id) === null) {
      projectsWithoutNext.push({ projectId: project.id, name: project.name, kind: project.kind });
    }
  }

  const waiting = getWaitingTasks(state);
  const someday = getSomedayTasks(state);

  // 8 周完成趋势（本周为最后一格）
  const weeklyCompletion = new Array<number>(8).fill(0);
  const thisWeekStart = startOfDay(now - ((new Date(now).getDay() + 6) % 7) * 86400000);
  for (const task of Object.values(state.tasks)) {
    if (task.deletedAt !== null || task.completedAt === null) continue;
    const weeksAgo = Math.floor((thisWeekStart - startOfDay(task.completedAt)) / (7 * 86400000));
    if (weeksAgo >= 0 && weeksAgo < 8) {
      const index = 7 - weeksAgo;
      weeklyCompletion[index] = (weeklyCompletion[index] ?? 0) + 1;
    }
  }

  // 陈旧项目：14 天内既没有新任务、也没有任务更新
  const staleProjects: { projectId: string; name: string; days: number }[] = [];
  for (const project of selectActiveProjects(state)) {
    const projectTasks = Object.values(state.tasks).filter(
      (task) => task.deletedAt === null && task.projectId === project.id,
    );
    const lastTouch = projectTasks.reduce(
      (max, task) => Math.max(max, task.updatedAt, task.createdAt),
      project.updatedAt,
    );
    const days = Math.floor((now - lastTouch) / 86400000);
    if (days >= 14) staleProjects.push({ projectId: project.id, name: project.name, days });
  }

  let doneCount = 0;
  let openCount = 0;
  for (const task of Object.values(state.tasks)) {
    if (task.deletedAt !== null) continue;
    if (task.status === "done") doneCount++;
    else openCount++;
  }

  return {
    inboxCount: inbox.length,
    inboxSample: inbox.slice(0, 5).map((t) => ({ id: t.id, title: t.title })),
    projectsWithoutNext,
    completedLastWeek,
    upcomingCount,
    waitingCount: waiting.length,
    waitingSample: waiting.slice(0, 5).map((t) => ({ id: t.id, title: t.title, waitingFor: t.waitingFor })),
    somedayCount: someday.length,
    weeklyCompletion,
    staleProjects: staleProjects.slice(0, 5),
    doneCount,
    openCount,
  };
}

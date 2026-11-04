import type { Task } from "../models/task";
import type { AppState } from "../store/app-store";
import { startOfDayOf } from "../store/selectors/time";

/**
 * 统计面板的纯函数计算层。
 *
 * 口径（可解释、可测试）：
 * - 完成时间 = completedAt（普通任务）或 lastCompletedAt（重复任务最近一次完成）；
 * - 7/30 天窗口按自然日计算：含今天在内的最近 7/30 个日桶；
 * - completionRate7d = 7 天内完成数 ÷（7 天内完成数 + 7 天内创建且仍未完成数），
 *   分母为 0 时为 0，结果限制在 0..1；
 * - streakDays：从今天（今天无完成则从昨天）向前连续有完成记录的日数；
 * - throughputPerDay = completed7d ÷ 7，保留两位小数。
 *
 * 空库返回全 0 + 固定长度日桶，绝不抛错；now 可注入，函数不读系统时钟。
 */

export interface DailyBucket {
  dayStart: number;
  completed: number;
  created: number;
}

export interface ProjectStats {
  id: string;
  name: string;
  open: number;
  done: number;
}

export interface ContextStats {
  id: string;
  name: string;
  open: number;
}

export interface Stats {
  completed7d: number;
  completed30d: number;
  completionRate7d: number;
  streakDays: number;
  dailyBuckets: DailyBucket[];
  byProject: ProjectStats[];
  byContext: ContextStats[];
  throughputPerDay: number;
}

export interface StatsOptions {
  /** dailyBuckets 的天数（含今天），默认 7，范围 1..365 */
  days?: number;
}

const DAY = 86_400_000;

function completionTime(task: Task): number | null {
  if (task.completedAt !== null) return task.completedAt;
  if (task.lastCompletedAt !== null) return task.lastCompletedAt;
  return null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeStats(state: AppState, now: number, opts?: StatsOptions): Stats {
  const bucketDays = Math.min(365, Math.max(1, Math.trunc(opts?.days ?? 7)));
  const todayStart = startOfDayOf(now);
  const windowStart = todayStart - (bucketDays - 1) * DAY;
  const start7 = todayStart - 6 * DAY;
  const start30 = todayStart - 29 * DAY;

  const tasks = Object.values(state.tasks).filter((task) => task.deletedAt === null);

  let completed7d = 0;
  let completed30d = 0;
  let openCreated7d = 0;
  const dailyBuckets: DailyBucket[] = Array.from({ length: bucketDays }, (_, index) => ({
    dayStart: startOfDayOf(windowStart + index * DAY),
    completed: 0,
    created: 0,
  }));

  const completionDays = new Set<number>();

  for (const task of tasks) {
    const completedAt = completionTime(task);
    if (completedAt !== null && completedAt <= now) {
      if (completedAt >= start7) completed7d += 1;
      if (completedAt >= start30) completed30d += 1;
      const completedDay = startOfDayOf(completedAt);
      completionDays.add(completedDay);
      const bucket = dailyBuckets.findIndex((candidate) => candidate.dayStart === completedDay);
      if (bucket >= 0) {
        dailyBuckets[bucket]!.completed += 1;
      }
    }

    if (task.createdAt <= now) {
      if (task.createdAt >= start7 && task.status !== "done") openCreated7d += 1;
      const createdDay = startOfDayOf(task.createdAt);
      const createdBucket = dailyBuckets.findIndex(
        (candidate) => candidate.dayStart === createdDay,
      );
      if (createdBucket >= 0) {
        dailyBuckets[createdBucket]!.created += 1;
      }
    }
  }

  let streakDays = 0;
  let cursor = todayStart;
  if (!completionDays.has(cursor)) cursor -= DAY;
  while (completionDays.has(cursor)) {
    streakDays += 1;
    cursor -= DAY;
  }

  const rateDenominator = completed7d + openCreated7d;
  const completionRate7d =
    rateDenominator === 0 ? 0 : Math.min(1, Math.max(0, completed7d / rateDenominator));

  const byProject: ProjectStats[] = Object.values(state.projects)
    .filter((project) => project.deletedAt === null)
    .sort((a, b) =>
      a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    .map((project) => {
      let open = 0;
      let done = 0;
      for (const task of tasks) {
        if (task.projectId !== project.id) continue;
        if (task.status === "done") done += 1;
        else open += 1;
      }
      return { id: project.id, name: project.name, open, done };
    });

  const byContext: ContextStats[] = Object.values(state.contexts)
    .filter((context) => context.deletedAt === null)
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "zh-Hans-CN");
      if (byName !== 0) return byName;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((context) => {
      let open = 0;
      for (const task of tasks) {
        if (task.status === "done") continue;
        if (task.contextIds.includes(context.id)) open += 1;
      }
      return { id: context.id, name: context.name, open };
    });

  return {
    completed7d,
    completed30d,
    completionRate7d: round(completionRate7d, 3),
    streakDays,
    dailyBuckets,
    byProject,
    byContext,
    throughputPerDay: round(completed7d / 7, 2),
  };
}

import { countWords } from "./word-count";
import type { Task } from "../models/task";

/**
 * 写作统计：**每日字数曲线**。
 *
 * 数据来源：每次保存正文后写一条"当天总字数"快照（`kv["writing.daily"]`，
 * 形如 `{ "2026-11-05": 12800 }`）。为什么存"存量"而不是"当日增量"：
 * 存量是幂等的——同一天多次保存只覆盖同一个键，不需要累加逻辑，也不会因
 * 崩溃/重放而算重。曲线要的"每日新增"由相邻两天的存量差还原。
 *
 * 已知取舍：删除正文会让存量为负增长，曲线显示为负数（如实反映"净减"）；
 * 首次使用没有更早的存量，第一天的新增按"当天存量"计。
 */

export type WritingHistory = Record<string, number>;

/** 本地日期键：YYYY-MM-DD */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${String(d.getFullYear())}-${month}-${day}`;
}

/** 全库正文总字数（写作统计的"存量"） */
export function totalBodyWords(tasks: readonly Task[]): number {
  let total = 0;
  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    total += countWords(task.notes);
  }
  return total;
}

/** 写入/更新今天的存量快照（返回新对象，不改入参） */
export function recordDailyWords(
  history: WritingHistory,
  totalWords: number,
  now: number,
): WritingHistory {
  return { ...history, [dayKey(now)]: totalWords };
}

export interface DailyWritingPoint {
  /** YYYY-MM-DD */
  day: string;
  /** 当天结束时的存量字数 */
  total: number;
  /** 当天净增字数（存量差；首日为存量本身） */
  delta: number;
}

export interface WritingSummary {
  /** 按日升序，长度 = days */
  points: DailyWritingPoint[];
  /** 当前总字数（最新存量） */
  currentTotal: number;
  /** 区间内净增合计 */
  totalDelta: number;
  /** 区间内有写作的日子数（delta > 0） */
  activeDays: number;
  /** 区间内最高单日净增 */
  bestDayDelta: number;
  /** 连续写作天数（从今天往前数，delta > 0 才计入） */
  streakDays: number;
}

/**
 * 计算最近 `days` 天的曲线。
 * 缺失的日期按"沿用前一天的存量、当日净增 0"处理（那几天没写字）。
 */
export function computeWritingSummary(
  history: WritingHistory,
  days: number,
  now: number,
): WritingSummary {
  const span = Math.max(1, Math.min(365, Math.trunc(days)));
  const DAY = 86_400_000;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const points: DailyWritingPoint[] = [];
  // 基线 = **第一个数据点之前那天**的存量（不是"昨天"——区间跨多天时
  // 用昨天当基线会让首日 delta 变成"首日存量 - 昨天存量"的负数）。
  const firstDayMs = todayStart.getTime() - (span - 1) * DAY;
  const beforeKey = dayKey(firstDayMs - DAY);
  let previousTotal = history[beforeKey] ?? 0;

  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const dayMs = todayStart.getTime() - offset * DAY;
    const key = dayKey(dayMs);
    const recorded = history[key];
    const total = recorded ?? previousTotal;
    const delta = recorded === undefined ? 0 : total - previousTotal;
    points.push({ day: key, total, delta });
    previousTotal = total;
  }

  const totalDelta = points.reduce((sum, point) => sum + point.delta, 0);
  const activeDays = points.filter((point) => point.delta > 0).length;
  const bestDayDelta = points.reduce((best, point) => Math.max(best, point.delta), 0);

  // 连续写作：从今天往前数，遇到 delta<=0 就停
  let streakDays = 0;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if ((points[index]?.delta ?? 0) > 0) streakDays += 1;
    else break;
  }

  return {
    points,
    currentTotal: points[points.length - 1]?.total ?? 0,
    totalDelta,
    activeDays,
    bestDayDelta,
    streakDays,
  };
}

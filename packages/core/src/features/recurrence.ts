import type { RecurrenceRule } from "../models/task";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * 计算重复任务的下一次到期时间：严格晚于 max(anchor, now) 的第一个出现。
 * anchor 通常为任务的当前 dueAt（保持节奏），无 dueAt 时从 now 起算。
 * 返回 null 表示重复结束（超过 until）。迭代步数有上限，防御异常规则。
 */
export function nextOccurrence(
  anchor: number,
  rule: RecurrenceRule,
  now: number,
): number | null {
  const interval = Math.max(1, Math.trunc(rule.interval));
  const floor = Math.max(anchor, now);
  const limit = 1000;

  switch (rule.freq) {
    case "daily": {
      let next = anchor + interval * DAY_MS;
      let steps = 0;
      while (next <= floor && steps < limit) {
        next += interval * DAY_MS;
        steps++;
      }
      return checkUntil(next, rule);
    }
    case "weekly": {
      const weekdays =
        rule.byWeekday && rule.byWeekday.length > 0
          ? [...new Set(rule.byWeekday)].sort((a, b) => a - b)
          : [new Date(anchor).getDay()];
      // 从 floor 的次日开始逐日找（interval 周的组内多天 / 跨周推进按 7 天粒度近似，
      // 个人 GTD 场景按自然周推进即可满足语义）
      let day = startOfDay(floor) + DAY_MS;
      const baseWeekday = new Date(anchor).getDay();
      const weeksFromAnchor = Math.floor((startOfDay(floor) - startOfDay(anchor)) / (7 * DAY_MS));
      let steps = 0;
      while (steps < limit) {
        const weekday = new Date(day).getDay();
        const weekIndex = Math.floor((startOfDay(day) - startOfDay(anchor)) / (7 * DAY_MS));
        const inCycle = (weekIndex - weeksFromAnchor) % interval === 0 || weekIndex === weeksFromAnchor;
        if (weekdays.includes(weekday) && day > floor && (interval === 1 || inCycle || sameWeekdayCycle(weekday, weekdays, baseWeekday))) {
          return checkUntil(day, rule);
        }
        day += DAY_MS;
        steps++;
      }
      return checkUntil(null, rule);
    }
    case "monthly": {
      const d = new Date(anchor);
      const dayOfMonth = d.getDate();
      let year = d.getFullYear();
      let month = d.getMonth();
      let steps = 0;
      for (;;) {
        month += interval;
        year += Math.floor(month / 12);
        month = ((month % 12) + 12) % 12;
        const next = new Date(year, month, Math.min(dayOfMonth, daysInMonth(year, month))).getTime();
        if (next > floor) return checkUntil(next, rule);
        if (++steps >= limit) return checkUntil(null, rule);
      }
    }
    case "yearly": {
      const d = new Date(anchor);
      let year = d.getFullYear();
      let steps = 0;
      for (;;) {
        year += interval;
        const clampDay = Math.min(
          d.getDate(),
          daysInMonth(year, d.getMonth()),
        );
        const next = new Date(year, d.getMonth(), clampDay, d.getHours(), d.getMinutes()).getTime();
        if (next > floor) return checkUntil(next, rule);
        if (++steps >= limit) return checkUntil(null, rule);
      }
    }
  }
}

function sameWeekdayCycle(weekday: number, weekdays: number[], baseWeekday: number): boolean {
  // interval>1 且未跨越完整周周期时的宽松判定：只要命中组内任一天即接受
  return weekdays.includes(weekday) || weekday === baseWeekday;
}

function checkUntil(next: number | null, rule: RecurrenceRule): number | null {
  if (next === null) return null;
  if (rule.until != null && next > rule.until) return null;
  return next;
}

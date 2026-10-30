import type { RecurrenceRule } from "../models/task";
import { endOfDay, startOfDay } from "./recurrence";
import { normalizeTags } from "./tags";

/**
 * 快速添加自然语言解析（中英混排）。纯函数：输入原始文本 + 当前时间，
 * 输出结构化字段；残余文本即任务标题。
 *
 * 语法（均可用空格分隔多个）：
 *   @情境          → contextNames（去掉 @）
 *   #项目          → projectName
 *   ! / !! / !!!   → priority 1/2/3
 *   > 人名         → waitingFor（同时建议 status=waiting）
 *   今天|明天|后天|大后天|today|tomorrow
 *   周X|星期X|礼拜X          → 本周（已过则下周）
 *   下周X                    → 下周
 *   N天后 | in N days
 *   M月D日 | MM-DD | YYYY-MM-DD
 *   上午9点 / 下午3点30 / 晚上8点 / 15:30 / 3pm / 9am   → 修饰当日时间（默认 18:00）
 *   每天|每日|daily
 *   每周X|每周
 *   每月N日|monthly
 *   每年M月D日|yearly
 */

export interface QuickAddParseResult {
  title: string;
  priority: 1 | 2 | 3 | undefined;
  dueAt: number | undefined;
  waitingFor: string | undefined;
  contextNames: string[];
  /** +标签：多维检索用 */
  tags: string[];
  projectName: string | undefined;
  recurrence: RecurrenceRule | undefined;
  /** > 语法出现时建议 status=waiting */
  suggestsWaiting: boolean;
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

const EN_WEEKDAY_MAP: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

const DEFAULT_DUE_HOUR = 18;

function atTime(dayStart: number, hour: number, minute = 0): number {
  const d = new Date(dayStart);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function weekdayOn(weekStart: number, weekday: number): number {
  const d = new Date(weekStart);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

function mondayOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const shift = (d.getDay() + 6) % 7; // 周一为一周起点
  d.setDate(d.getDate() - shift);
  return d.getTime();
}

interface Extracted {
  text: string;
  priority: 1 | 2 | 3 | undefined;
  dueDayStart: number | undefined;
  recurrence: RecurrenceRule | undefined;
  contextNames: string[];
  projectName: string | undefined;
  waitingFor: string | undefined;
  tags: string[];
}

function cut(text: string, match: RegExpMatchArray): string {
  return text.replace(match[0], " ");
}

export function parseQuickAdd(input: string, now: number): QuickAddParseResult {
  let text = input.trim();
  let priority: 1 | 2 | 3 | undefined;
  let dueDayStart: number | undefined;
  let recurrence: RecurrenceRule | undefined;
  const contextNames: string[] = [];
  let projectName: string | undefined;
  let waitingFor: string | undefined;

  // 1) 情境（可多个）
  for (;;) {
    const m = text.match(/(?:^|\s)@([^\s@#>!]+)/u);
    if (!m) break;
    contextNames.push(m[1] ?? "");
    text = cut(text, m);
  }

  // 2) 项目
  {
    const m = text.match(/(?:^|\s)#([^\s@#>!]+)/u);
    if (m) {
      projectName = m[1];
      text = cut(text, m);
    }
  }

  // 2b) 标签（可多个）：+紧急 +等审批
  const rawTags: string[] = [];
  for (;;) {
    const m = text.match(/(?:^|\s)\+([^\s@#+>!]+)/u);
    if (!m) break;
    rawTags.push(m[1] ?? "");
    text = cut(text, m);
  }
  const tags = normalizeTags(rawTags);

  // 3) 等待中 >人
  {
    const m = text.match(/(?:^|\s)>\s*([^\s@#>!]+)/u);
    if (m) {
      waitingFor = m[1];
      text = cut(text, m);
    }
  }

  // 4) 优先级 !!!/!!!（优先取最长）
  {
    const m = text.match(/(?:^|\s)(!{1,3})(?=\s|$)/u);
    if (m) {
      priority = (m[1]?.length ?? 1) as 1 | 2 | 3;
      text = cut(text, m);
    }
  }

  // 5) 重复规则（每周X 可多次出现收集多天；其余形式各一次，循环 cut 保证标题干净）
  {
    // 5a) 优先识别多周期间隔与特殊月规则：双周 / 每隔N天 / 每月最后工作日
    let early: RecurrenceRule | undefined;
    {
      const biweekly = text.match(/(?:^|\s)(?:每两周|双周|隔周|biweekly)(?=\s|$)/iu);
      if (biweekly) {
        early = { freq: "weekly", interval: 2, until: null };
        text = cut(text, biweekly);
      }
      if (early === undefined) {
        const lastWorkday = text.match(/(?:^|\s)每月最后一?个?工作日(?=\s|$)/u);
        if (lastWorkday) {
          early = { freq: "monthly", interval: 1, lastWeekday: true, until: null };
          text = cut(text, lastWorkday);
        }
      }
      if (early === undefined) {
        const everyNDays = text.match(/(?:^|\s)(?:每隔|每)(\d{1,2})天(?=\s|$)/u);
        if (everyNDays) {
          early = { freq: "daily", interval: Math.max(2, Number(everyNDays[1])), until: null };
          text = cut(text, everyNDays);
        }
      }
      // 每工作日：只排周一到周五
      if (early === undefined) {
        const workdays = text.match(/(?:^|\s)(?:每个?工作日|工作日)(?=\s|$)/u);
        if (workdays) {
          early = { freq: "weekdays", interval: 1, until: null };
          text = cut(text, workdays);
        }
      }
      // 完成后N天：以完成时刻为基准，而非原到期日
      if (early === undefined) {
        const afterDone = text.match(/(?:^|\s)完成后(\d{1,3})天(?=\s|$)/u);
        if (afterDone) {
          early = {
            freq: "afterCompletion",
            interval: Math.max(1, Number(afterDone[1])),
            until: null,
          };
          text = cut(text, afterDone);
        }
      }
      // 重复N次：限定总次数（完成即消耗一次）
      let remainingCount: number | null = null;
      {
        const times = text.match(/(?:^|\s)重复(\d{1,3})次(?=\s|$)/u);
        if (times) {
          remainingCount = Math.max(1, Number(times[1]));
          text = cut(text, times);
        }
      }
      if (early !== undefined && remainingCount !== null) {
        early = { ...early, remainingCount };
      }
    }

    const weeklyDays: number[] = [];
    for (;;) {
      const m = text.match(/(?:^|\s)每周([一二三四五六日天])?/u);
      if (!m) break;
      if (m[1] !== undefined) weeklyDays.push(WEEKDAY_MAP[m[1]] ?? 1);
      text = cut(text, m);
      if (m[1] === undefined) break; // 裸"每周"只出现一次
    }
    if (early !== undefined) {
      recurrence = early;
    } else if (text.match(/(?:^|\s)(?:每天|每日|daily)(?=\s|$)/u)) {
      for (;;) {
        const m = text.match(/(?:^|\s)(?:每天|每日|daily)(?=\s|$)/u);
        if (!m) break;
        text = cut(text, m);
      }
      recurrence = { freq: "daily", interval: 1, until: null };
    } else if (weeklyDays.length > 0) {
      recurrence = {
        freq: "weekly",
        interval: 1,
        byWeekday: [...new Set(weeklyDays)],
        until: null,
      };
    } else {
      for (;;) {
        const m = text.match(/(?:^|\s)每月(\d{1,2})[日号]?(?=\s|$)/u);
        if (!m) break;
        recurrence = { freq: "monthly", interval: 1, until: null };
        dueDayStart = monthDayThisOrNext(now, Number(m[1]), new Date(now).getMonth());
        text = cut(text, m);
      }
      for (;;) {
        const m = text.match(/(?:^|\s)每年(\d{1,2})月(\d{1,2})[日号]?(?=\s|$)/u);
        if (!m) break;
        recurrence = { freq: "yearly", interval: 1, until: null };
        dueDayStart = monthDayThisOrNext(now, Number(m[2]), Number(m[1]) - 1);
        text = cut(text, m);
      }
    }
  }

  // 6) 日期
  if (dueDayStart === undefined) {
    let m = text.match(/(?:^|\s)(今天|today)(?=\s|$)/iu);
    if (m) {
      dueDayStart = startOfDay(now);
      text = cut(text, m);
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(明天|tomorrow)(?=\s|$)/iu);
      if (m) {
        dueDayStart = startOfDay(now) + 24 * 60 * 60 * 1000;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(后天|大后天)(?=\s|$)/u);
      if (m) {
        dueDayStart = startOfDay(now) + (m[1] === "后天" ? 2 : 3) * 24 * 60 * 60 * 1000;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(\d{1,3})天后/u);
      if (m) {
        dueDayStart = startOfDay(now) + Number(m[1]) * 24 * 60 * 60 * 1000;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)in\s+(\d{1,3})\s*days?(?=\s|$)/iu);
      if (m) {
        dueDayStart = startOfDay(now) + Number(m[1]) * 24 * 60 * 60 * 1000;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      // 下周X（"下周三" = 下周 + 三，"周"字属于"下周"）
      m = text.match(/(?:^|\s)下周([一二三四五六日天])/u);
      if (m) {
        const weekday = WEEKDAY_MAP[m[1] ?? "一"] ?? 1;
        dueDayStart = weekdayOn(mondayOfWeek(now), weekday) + 7 * 24 * 60 * 60 * 1000;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=\s|$)/iu);
      if (m) {
        const weekday = EN_WEEKDAY_MAP[(m[1] ?? "monday").toLowerCase()] ?? 1;
        dueDayStart = weekdayOn(mondayOfWeek(now), weekday) + 7 * 24 * 60 * 60 * 1000;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(?:周|星期|礼拜)([一二三四五六日天])/u);
      if (m) {
        const weekday = WEEKDAY_MAP[m[1] ?? "一"] ?? 1;
        const thisWeek = weekdayOn(mondayOfWeek(now), weekday);
        // 本周已过的星期X → 下周；今天或未来 → 本周
        dueDayStart =
          thisWeek < startOfDay(now) ? thisWeek + 7 * 24 * 60 * 60 * 1000 : thisWeek;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(
        /(?:^|\s)(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=\s|$)/iu,
      );
      if (m) {
        const weekday = EN_WEEKDAY_MAP[(m[2] ?? "monday").toLowerCase()] ?? 1;
        const thisWeek = weekdayOn(mondayOfWeek(now), weekday);
        dueDayStart =
          m[1] !== undefined || thisWeek < startOfDay(now)
            ? thisWeek + 7 * 24 * 60 * 60 * 1000
            : thisWeek;
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=\s|$)/u);
      if (m) {
        dueDayStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(\d{1,2})-(\d{1,2})(?=\s|$)/u);
      if (m) {
        dueDayStart = monthDayThisOrNext(now, Number(m[2]), Number(m[1]) - 1);
        text = cut(text, m);
      }
    }
    if (dueDayStart === undefined) {
      m = text.match(/(?:^|\s)(\d{1,2})月(\d{1,2})[日号]?(?=\s|$)/u);
      if (m) {
        dueDayStart = monthDayThisOrNext(now, Number(m[2]), Number(m[1]) - 1);
        text = cut(text, m);
      }
    }
  }

  // 7) 时间修饰（作用于已解析的日期，否则默认今天）
  let timeSet = false;
  {
    const m = text.match(/(?:^|\s)(?:上午|早上)\s*(\d{1,2})[点时:：](\d{1,2})?分?(?=\s|$)/u);
    if (m) {
      timeSet = true;
      dueDayStart = atTime(dueDayStart ?? startOfDay(now), Number(m[1] ?? "9"), Number(m[2] ?? "0"));
      text = cut(text, m);
    }
  }
  if (!timeSet) {
    const m = text.match(/(?:^|\s)(?:下午|晚上)\s*(\d{1,2})[点时:：](\d{1,2})?分?(?=\s|$)/u);
    if (m) {
      timeSet = true;
      const hour = (Number(m[1]) % 12) + 12;
      dueDayStart = atTime(dueDayStart ?? startOfDay(now), hour, Number(m[2] ?? "0"));
      text = cut(text, m);
    }
  }
  if (!timeSet) {
    const m = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/u);
    if (m) {
      timeSet = true;
      dueDayStart = atTime(dueDayStart ?? startOfDay(now), Number(m[1]), Number(m[2]));
      text = cut(text, m);
    }
  }
  if (!timeSet) {
    const m = text.match(/(?:^|\s)(\d{1,2})\s*(am|pm)(?=\s|$)/iu);
    if (m) {
      timeSet = true;
      let hour = Number(m[1] ?? "12") % 12;
      if ((m[2] ?? "").toLowerCase() === "pm") hour += 12;
      dueDayStart = atTime(dueDayStart ?? startOfDay(now), hour, 0);
      text = cut(text, m);
    }
  }
  if (!timeSet && dueDayStart !== undefined) {
    dueDayStart = atTime(startOfDay(dueDayStart), DEFAULT_DUE_HOUR, 0);
  }

  const title = text.replace(/\s+/gu, " ").trim();

  return {
    title: title.length > 0 ? title : input.trim(),
    priority,
    dueAt: dueDayStart,
    waitingFor,
    contextNames: contextNames.filter((n) => n.length > 0),
    tags: tags.filter((n) => n.length > 0),
    projectName,
    recurrence,
    suggestsWaiting: waitingFor !== undefined,
  };
}

/** 给定 (月 index, 日)，若今年已过则取明年 */
function monthDayThisOrNext(now: number, day: number, monthIndex0: number): number {
  const y = new Date(now).getFullYear();
  const candidate = new Date(y, monthIndex0, day).getTime();
  if (candidate >= startOfDay(now)) return candidate;
  return new Date(y + 1, monthIndex0, day).getTime();
}

export interface QuickAddCommandInput {
  title: string;
  priority?: 1 | 2 | 3;
  dueAt?: number;
  waitingFor?: string;
  contextIds: string[];
  projectId?: string;
  recurrence?: RecurrenceRule;
}

/** 解析结果 → task.create payload（status 由 > 语法决定） */
export function toTaskCreateInput(
  parsed: QuickAddParseResult,
  resolved: { contextIds: string[]; projectId?: string },
): QuickAddCommandInput {
  return {
    title: parsed.title,
    priority: parsed.priority,
    dueAt: parsed.dueAt,
    waitingFor: parsed.waitingFor,
    contextIds: resolved.contextIds,
    projectId: resolved.projectId,
    recurrence: parsed.recurrence,
  };
}

export { endOfDay };

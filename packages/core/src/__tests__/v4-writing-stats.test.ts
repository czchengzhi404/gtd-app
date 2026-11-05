import { describe, expect, test } from "bun:test";

import {
  computeWritingSummary,
  dayKey,
  recordDailyWords,
  totalBodyWords,
} from "../features/writing-stats";
import type { Task } from "../models/task";

function at(year: number, month: number, day: number, hour = 12): number {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

function task(notes: string, deletedAt: number | null = null): Task {
  return {
    id: `t-${notes.length}-${notes.slice(0, 3)}`,
    createdAt: 0,
    updatedAt: 0,
    revision: 1,
    deletedAt,
    title: "稿",
    notes,
    status: "next",
    priority: 0,
    deferUntil: null,
    dueAt: null,
    completedAt: null,
    lastCompletedAt: null,
    projectId: null,
    sectionId: null,
    contextIds: [],
    tags: [],
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: "a",
  } as Task;
}

describe("dayKey", () => {
  test("本地日期补零", () => {
    expect(dayKey(at(2026, 11, 5))).toBe("2026-11-05");
    expect(dayKey(at(2026, 1, 9))).toBe("2026-01-09");
  });
});

describe("totalBodyWords", () => {
  test("累加所有未删除任务的正文", () => {
    expect(totalBodyWords([task("字".repeat(10)), task("hello world")])).toBe(12);
  });

  test("跳过已删除任务", () => {
    expect(totalBodyWords([task("字".repeat(10)), task("字".repeat(50), 123)])).toBe(10);
  });

  test("空库为 0", () => {
    expect(totalBodyWords([])).toBe(0);
  });
});

describe("recordDailyWords", () => {
  test("写入当天键且不修改原对象", () => {
    const before = { "2026-11-04": 100 };
    const after = recordDailyWords(before, 250, at(2026, 11, 5));
    expect(after).toEqual({ "2026-11-04": 100, "2026-11-05": 250 });
    expect(before).toEqual({ "2026-11-04": 100 });
  });

  test("同一天多次写入只保留最新（幂等）", () => {
    let history = recordDailyWords({}, 100, at(2026, 11, 5, 9));
    history = recordDailyWords(history, 300, at(2026, 11, 5, 18));
    expect(history["2026-11-05"]).toBe(300);
  });
});

describe("computeWritingSummary", () => {
  const now = at(2026, 11, 5);

  test("相邻存量差 = 当日净增", () => {
    const history = {
      "2026-11-03": 100,
      "2026-11-04": 400,
      "2026-11-05": 1000,
    };
    const summary = computeWritingSummary(history, 3, now);
    expect(summary.points.map((point) => point.delta)).toEqual([100, 300, 600]);
    expect(summary.currentTotal).toBe(1000);
    expect(summary.totalDelta).toBe(1000);
  });

  test("缺失的日期沿用前一天存量、当日净增 0", () => {
    const history = { "2026-11-03": 100, "2026-11-05": 500 };
    const summary = computeWritingSummary(history, 3, now);
    expect(summary.points.map((point) => point.delta)).toEqual([100, 0, 400]);
  });

  test("一天都没记录时为全零", () => {
    const summary = computeWritingSummary({}, 7, now);
    expect(summary.currentTotal).toBe(0);
    expect(summary.totalDelta).toBe(0);
    expect(summary.points).toHaveLength(7);
  });

  test("删除正文会显示为负增长（如实反映净减）", () => {
    const history = { "2026-11-04": 1000, "2026-11-05": 400 };
    expect(computeWritingSummary(history, 2, now).points[1]?.delta).toBe(-600);
  });

  test("连续写作天数从今天往前数", () => {
    const history = {
      "2026-11-02": 10,
      "2026-11-03": 50,
      "2026-11-04": 90,
      "2026-11-05": 120,
    };
    expect(computeWritingSummary(history, 4, now).streakDays).toBe(4);
  });

  test("今天没写则连续天数为 0", () => {
    const history = { "2026-11-03": 50, "2026-11-04": 90 };
    expect(computeWritingSummary(history, 3, now).streakDays).toBe(0);
  });

  test("活跃天数与最佳单日", () => {
    const history = { "2026-11-03": 100, "2026-11-04": 100, "2026-11-05": 500 };
    const summary = computeWritingSummary(history, 3, now);
    expect(summary.activeDays).toBe(2); // 11-04 没变，不算
    expect(summary.bestDayDelta).toBe(400);
  });

  test("days 被夹到 1..365", () => {
    expect(computeWritingSummary({}, 0, now).points).toHaveLength(1);
    expect(computeWritingSummary({}, 9999, now).points).toHaveLength(365);
  });

  test("起点前一天的存量作为首日基线", () => {
    const history = { "2026-11-04": 500, "2026-11-05": 800 };
    // 只取 11-05 一天：基线来自 11-04 的 500，所以首日 delta = 300
    expect(computeWritingSummary(history, 1, now).points[0]?.delta).toBe(300);
  });
});

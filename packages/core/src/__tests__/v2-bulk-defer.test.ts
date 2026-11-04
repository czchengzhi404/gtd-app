import { describe, expect, test } from "bun:test";

import { deferTargetTime, planBulkDefer } from "../features/bulk-ops";

/** 2026-11-04 是周三 */
function wednesdayNoon(): number {
  const d = new Date(2026, 10, 4, 12, 0, 0, 0);
  return d.getTime();
}

function at(year: number, month: number, day: number, hour: number): number {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

describe("deferTargetTime", () => {
  test("今天落在今天 18:00", () => {
    expect(deferTargetTime("today", wednesdayNoon())).toBe(at(2026, 11, 4, 18));
  });

  test("明天落在明天 18:00", () => {
    expect(deferTargetTime("tomorrow", wednesdayNoon())).toBe(at(2026, 11, 5, 18));
  });

  test("下周从周三算到下周一 18:00", () => {
    expect(deferTargetTime("nextWeek", wednesdayNoon())).toBe(at(2026, 11, 9, 18));
  });

  test("周一当天按 7 天后算（不返回今天）", () => {
    const monday = new Date(2026, 10, 2, 9, 0, 0, 0).getTime();
    expect(deferTargetTime("nextWeek", monday)).toBe(at(2026, 11, 9, 18));
  });

  test("周日算到次日周一 18:00", () => {
    const sunday = new Date(2026, 10, 1, 9, 0, 0, 0).getTime();
    expect(deferTargetTime("nextWeek", sunday)).toBe(at(2026, 11, 2, 18));
  });
});

describe("planBulkDefer", () => {
  const dueAt = at(2026, 11, 9, 18);

  test("run 把每个任务改到目标 dueAt", () => {
    const plan = planBulkDefer([{ id: "a", dueAt: null }, { id: "b", dueAt: 1 }], dueAt);
    expect(plan.run).toEqual([
      { op: "task.update", payload: { id: "a", patch: { dueAt } } },
      { op: "task.update", payload: { id: "b", patch: { dueAt } } },
    ]);
  });

  test("undo 回到各自的原始 dueAt（不是统一清空）", () => {
    const plan = planBulkDefer([{ id: "a", dueAt: null }, { id: "b", dueAt: 12345 }], dueAt);
    expect(plan.undo).toEqual([
      { op: "task.update", payload: { id: "a", patch: { dueAt: null } } },
      { op: "task.update", payload: { id: "b", patch: { dueAt: 12345 } } },
    ]);
  });

  test("空选择生成空计划", () => {
    const plan = planBulkDefer([], dueAt);
    expect(plan.run).toEqual([]);
    expect(plan.undo).toEqual([]);
  });
});

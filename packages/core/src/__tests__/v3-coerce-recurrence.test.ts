import { describe, expect, test } from "bun:test";

import { coerceTask } from "../db/coerce";

/**
 * 回归：coerceTask 必须完整保留 RecurrenceRule 的 6 种 freq 与可选字段。
 *
 * 背景：此前的实现只接受 daily/weekly/monthly/yearly 四种 freq，且完全没读
 * lastWeekday / remainingCount。后果是——任何经 sync.applyRemote 或 JSON 导入
 * 进来的「每工作日」「完成后 N 天」重复任务，recurrence 会被静默置为 null，
 * 「每月最后一个工作日」「重复 5 次」也会丢，且不报任何错。
 */

function taskWithRecurrence(recurrence: unknown): Record<string, unknown> {
  return {
    id: "0192a4c1-7f3e-7abc-8def-0123456789ab",
    title: "每周写周报",
    status: "next",
    recurrence,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    revision: 1,
    deletedAt: null,
  };
}

describe("coerceTask · 重复规则", () => {
  test("weekdays 保留（此前会被丢成 null）", () => {
    const task = coerceTask(taskWithRecurrence({ freq: "weekdays", interval: 1 }));
    expect(task?.recurrence?.freq).toBe("weekdays");
  });

  test("afterCompletion 保留（此前会被丢成 null）", () => {
    const task = coerceTask(taskWithRecurrence({ freq: "afterCompletion", interval: 3 }));
    expect(task?.recurrence).toMatchObject({ freq: "afterCompletion", interval: 3 });
  });

  test("lastWeekday 保留（此前完全没读）", () => {
    const task = coerceTask(
      taskWithRecurrence({ freq: "monthly", interval: 1, lastWeekday: true }),
    );
    expect(task?.recurrence?.lastWeekday).toBe(true);
  });

  test("remainingCount 保留（此前完全没读）", () => {
    const task = coerceTask(
      taskWithRecurrence({ freq: "daily", interval: 1, remainingCount: 5 }),
    );
    expect(task?.recurrence?.remainingCount).toBe(5);
  });

  test("remainingCount 缺失时为 null（= 无限重复）", () => {
    const task = coerceTask(taskWithRecurrence({ freq: "daily", interval: 1 }));
    expect(task?.recurrence?.remainingCount).toBeNull();
  });

  test("byWeekday / until 仍正常工作", () => {
    const task = coerceTask(
      taskWithRecurrence({
        freq: "weekly",
        interval: 1,
        byWeekday: ["1", "3"],
        until: 1_800_000_000_000,
      }),
    );
    expect(task?.recurrence?.byWeekday).toEqual([1, 3]);
    expect(task?.recurrence?.until).toBe(1_800_000_000_000);
  });

  test("非法 freq 仍然被丢弃（不因放宽而放水）", () => {
    const task = coerceTask(taskWithRecurrence({ freq: "hourly", interval: 1 }));
    expect(task?.recurrence).toBeNull();
  });

  test("interval 小于 1 或非数字时兜底为 1", () => {
    const task = coerceTask(taskWithRecurrence({ freq: "daily", interval: 0 }));
    expect(task?.recurrence?.interval).toBe(1);
  });

  test("recurrence 为 null / 缺失时不报错", () => {
    expect(coerceTask(taskWithRecurrence(null))?.recurrence).toBeNull();
    expect(coerceTask(taskWithRecurrence(undefined))?.recurrence).toBeNull();
  });
});

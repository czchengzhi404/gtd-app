import { describe, expect, test } from "bun:test";

import {
  planBulkComplete,
  planBulkDelete,
  planBulkMove,
  planDeferToTomorrow,
} from "../features/bulk-ops";
import { parseQuickAdd } from "../features/quick-add";

const NOW = new Date(2026, 9, 31, 10, 0, 0).getTime(); // 周六 10:00

/** 采纳的优化项 1：批量操作规划下移 core */
describe("bulk-ops 命令规划", () => {
  test("planBulkComplete：正序完成 + 等序撤销", () => {
    const plan = planBulkComplete(["a", "b"]);
    expect(plan.run).toEqual([
      { op: "task.complete", payload: { id: "a" } },
      { op: "task.complete", payload: { id: "b" } },
    ]);
    expect(plan.undo).toEqual([
      { op: "task.uncomplete", payload: { id: "a" } },
      { op: "task.uncomplete", payload: { id: "b" } },
    ]);
  });

  test("planBulkDelete：softDelete + restore 撤销", () => {
    const plan = planBulkDelete(["x"]);
    expect(plan.run[0]?.op).toBe("task.softDelete");
    expect(plan.undo[0]?.op).toBe("task.restore");
  });

  test("planBulkMove：撤销回到各自原状态（不是统一状态）", () => {
    const plan = planBulkMove(
      [
        { id: "a", from: "inbox" },
        { id: "b", from: "waiting" },
      ],
      "next",
    );
    expect(plan.run).toEqual([
      { op: "task.moveStatus", payload: { id: "a", status: "next" } },
      { op: "task.moveStatus", payload: { id: "b", status: "next" } },
    ]);
    expect(plan.undo).toEqual([
      { op: "task.moveStatus", payload: { id: "a", status: "inbox" } },
      { op: "task.moveStatus", payload: { id: "b", status: "waiting" } },
    ]);
  });

  test("planDeferToTomorrow：明天 9:00 + 撤销回原值", () => {
    const plan = planDeferToTomorrow("t1", NOW, 123);
    const tomorrow = new Date(plan.deferredAt);
    expect(`${tomorrow.getFullYear()}-${tomorrow.getMonth() + 1}-${tomorrow.getDate()}`).toBe("2026-11-1");
    expect(tomorrow.getHours()).toBe(9);
    expect(plan.run).toEqual({
      op: "task.update",
      payload: { id: "t1", patch: { deferUntil: plan.deferredAt } },
    });
    expect(plan.undo).toEqual({
      op: "task.update",
      payload: { id: "t1", patch: { deferUntil: 123 } },
    });
  });
});

/** 采纳的优化项 3：解析器语义修正 */
describe("解析器语义修正（审计后采纳项）", () => {
  test("每1天 → daily interval 1（原来被强制升到 2）", () => {
    const r = parseQuickAdd("打卡 每1天", NOW);
    expect(r.recurrence).toEqual({ freq: "daily", interval: 1, until: null });
  });

  test("每隔1天 → 传统语义 每两天（interval 2）", () => {
    const r = parseQuickAdd("浇水 每隔1天", NOW);
    expect(r.recurrence?.freq).toBe("daily");
    expect(r.recurrence?.interval).toBe(2);
  });

  test("每3天 / 每隔3天 → interval 3", () => {
    expect(parseQuickAdd("a 每3天", NOW).recurrence?.interval).toBe(3);
    expect(parseQuickAdd("a 每隔3天", NOW).recurrence?.interval).toBe(3);
  });

  test("!!!!（4 个叹号）→ 优先级 3 且不残留 ! 进标题", () => {
    const r = parseQuickAdd("快跑 !!!!", NOW);
    expect(r.priority).toBe(3);
    expect(r.title).toBe("快跑");
  });

  test("每周一三 紧凑写法（v0.11.0 审计修复的回归锁定）", () => {
    expect(parseQuickAdd("上课 每周一三", NOW).recurrence?.byWeekday).toEqual([1, 3]);
  });

  test("重复N次 与 每天 叠加（v0.11.0 审计修复的回归锁定）", () => {
    const r = parseQuickAdd("打卡 每天 重复5次", NOW);
    expect(r.recurrence?.freq).toBe("daily");
    expect(r.recurrence?.remainingCount).toBe(5);
  });
});

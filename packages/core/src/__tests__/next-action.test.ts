import { describe, expect, test } from "bun:test";

import { pickNextAction } from "../features/next-action";
import type { Task } from "../models/task";

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime(); // 2026-11-13 10:00 本地
const DAY = 86_400_000;

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: partial.id,
    notes: "",
    status: "inbox",
    priority: 0,
    deferUntil: null,
    dueAt: null,
    completedAt: null,
    lastCompletedAt: null,
    projectId: null,
    sectionId: null,
    contextIds: [],
    tags: [],
    blockedBy: [],
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: partial.id,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    ...partial,
  };
}

describe("pickNextAction", () => {
  test("空列表 → 全 null / 0", () => {
    expect(pickNextAction([], NOW)).toEqual({
      next: null,
      rest: [],
      blockedCount: 0,
      availableCount: 0,
    });
  });

  test("排除已完成与软删", () => {
    const r = pickNextAction(
      [
        task({ id: "a", status: "done" }),
        task({ id: "b", deletedAt: NOW }),
        task({ id: "c" }),
      ],
      NOW,
    );
    expect(r.next?.id).toBe("c");
    expect(r.availableCount).toBe(1);
  });

  test("排除推迟到未来的", () => {
    const r = pickNextAction(
      [task({ id: "a", deferUntil: NOW + DAY }), task({ id: "b" })],
      NOW,
    );
    expect(r.next?.id).toBe("b");
  });

  test("逾期优先于今天，今天优先于未来，未来优先于无日期", () => {
    const r = pickNextAction(
      [
        task({ id: "none" }),
        task({ id: "future", dueAt: NOW + 3 * DAY }),
        task({ id: "today", dueAt: NOW + 2 * 60 * 60 * 1000 }), // 今天 12:00
        task({ id: "overdue", dueAt: NOW - DAY }),
      ],
      NOW,
    );
    expect(r.next?.id).toBe("overdue");
    expect(r.rest.map((t) => t.id)).toEqual(["today", "future", "none"]);
  });

  test("同级按优先级，再按 orderKey", () => {
    const r = pickNextAction(
      [
        task({ id: "z", orderKey: "0009", priority: 0 }),
        task({ id: "p1", orderKey: "0008", priority: 1 }),
        task({ id: "p1-early", orderKey: "0001", priority: 1 }),
      ],
      NOW,
    );
    expect(r.next?.id).toBe("p1-early");
  });

  test("前置未完成 → 被挡住，不进入可做队列", () => {
    const r = pickNextAction(
      [
        task({ id: "first" }),
        task({ id: "second", blockedBy: ["first"] }),
      ],
      NOW,
    );
    expect(r.next?.id).toBe("first");
    expect(r.blockedCount).toBe(1);
    expect(r.availableCount).toBe(1);
    expect(r.rest).toEqual([]);
  });

  test("前置已完成 → 解除阻塞，下一件浮上来", () => {
    const r = pickNextAction(
      [
        task({ id: "first", status: "done" }),
        task({ id: "second", blockedBy: ["first"] }),
      ],
      NOW,
    );
    expect(r.next?.id).toBe("second");
    expect(r.blockedCount).toBe(0);
    expect(r.availableCount).toBe(1);
  });

  test("前置指向不存在的 id 视为未完成（保守：宁可挡住也别漏做）", () => {
    const r = pickNextAction([task({ id: "x", blockedBy: ["ghost"] })], NOW);
    expect(r.next).toBeNull();
    expect(r.blockedCount).toBe(1);
  });

  test("链式依赖：A→B→C 只有 A 可做", () => {
    const r = pickNextAction(
      [
        task({ id: "A" }),
        task({ id: "B", blockedBy: ["A"] }),
        task({ id: "C", blockedBy: ["B"] }),
      ],
      NOW,
    );
    expect(r.next?.id).toBe("A");
    expect(r.blockedCount).toBe(2);
  });

  test("不修改入参数组顺序", () => {
    const input = [task({ id: "c", orderKey: "0003" }), task({ id: "a", orderKey: "0001" })];
    pickNextAction(input, NOW);
    expect(input.map((t) => t.id)).toEqual(["c", "a"]);
  });

  test("旧记录缺 blockedBy 时不崩，当作无前置", () => {
    // v2.7.18 首屏曾因此崩掉：老版本导出的任务对象没有这个字段
    const legacy = { ...task({ id: "old", orderKey: "0001" }) } as Partial<Task>;
    delete legacy.blockedBy;
    const r = pickNextAction([legacy as Task], NOW);
    expect(r.next?.id).toBe("old");
    expect(r.blockedCount).toBe(0);
  });
});

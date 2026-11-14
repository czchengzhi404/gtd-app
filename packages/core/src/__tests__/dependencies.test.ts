import { describe, expect, test } from "bun:test";

import {
  prereqCandidates,
  unresolvedPrereqs,
  wouldCreateCycle,
} from "../features/dependencies";
import type { Task } from "../models/task";

const NOW = 1_700_000_000_000;

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

describe("wouldCreateCycle", () => {
  test("自己等自己 → 环", () => {
    expect(wouldCreateCycle([task({ id: "a" })], "a", "a")).toBe(true);
  });

  test("两任务互等 → 第二条成环", () => {
    const tasks = [task({ id: "a", blockedBy: ["b"] }), task({ id: "b" })];
    expect(wouldCreateCycle(tasks, "b", "a")).toBe(true);
  });

  test("无环的普通依赖 → 不成环", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(wouldCreateCycle(tasks, "b", "a")).toBe(false);
  });

  test("长链 c 等 b 等 a，再让 a 等 c → 成环", () => {
    // blockedBy 的语义是「我等谁」：c 等 b，b 等 a
    const tasks = [
      task({ id: "c", blockedBy: ["b"] }),
      task({ id: "b", blockedBy: ["a"] }),
      task({ id: "a" }),
    ];
    // 让 a 去等 c，就走回了起点
    expect(wouldCreateCycle(tasks, "a", "c")).toBe(true);
  });

  test("长链里加一条不成环的边 → 不成环", () => {
    const tasks = [
      task({ id: "c", blockedBy: ["b"] }),
      task({ id: "b", blockedBy: ["a"] }),
      task({ id: "a" }),
    ];
    // c 已经有前置 b 了，再等 a 只是新增一条不构成环的边
    expect(wouldCreateCycle(tasks, "c", "a")).toBe(false);
  });

  test("菱形依赖本身不成环", () => {
    // D 是最底层；A 等 B、C，B 和 C 都等 D
    const tasks = [
      task({ id: "A", blockedBy: ["B", "C"] }),
      task({ id: "B", blockedBy: ["D"] }),
      task({ id: "C", blockedBy: ["D"] }),
      task({ id: "D" }),
    ];
    // 让 B 再等 C（同层之间加边）不成环
    expect(wouldCreateCycle(tasks, "B", "C")).toBe(false);
    // 但让 D 等 A 会绕回 D 自己 → 成环
    expect(wouldCreateCycle(tasks, "D", "A")).toBe(true);
  });

  test("指向不存在的前置不会死循环", () => {
    const tasks = [task({ id: "a", blockedBy: ["ghost"] })];
    expect(wouldCreateCycle(tasks, "ghost2", "a")).toBe(false);
  });
});

describe("prereqCandidates", () => {
  test("排除自己", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(prereqCandidates(tasks, "a").map((t) => t.id)).toEqual(["b"]);
  });

  test("排除已软删", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", deletedAt: NOW })];
    expect(prereqCandidates(tasks, "a").map((t) => t.id)).toEqual([]);
  });

  test("排除会成环的候选", () => {
    const tasks = [task({ id: "a", blockedBy: ["b"] }), task({ id: "b" }), task({ id: "c" })];
    expect(prereqCandidates(tasks, "b").map((t) => t.id)).toEqual(["c"]);
  });

  test("未完成的排在已完成之前", () => {
    const tasks = [
      task({ id: "done1", status: "done", orderKey: "0001" }),
      task({ id: "open1", orderKey: "0002" }),
    ];
    expect(prereqCandidates(tasks, "me").map((t) => t.id)).toEqual(["open1", "done1"]);
  });
});

describe("unresolvedPrereqs", () => {
  test("只返回未完成且未删除的前置", () => {
    const tasks = [
      task({ id: "a", status: "done" }),
      task({ id: "b" }),
      task({ id: "c", deletedAt: NOW }),
    ];
    const target = task({ id: "me", blockedBy: ["a", "b", "c"] });
    expect(unresolvedPrereqs(target, [...tasks, target]).map((t) => t.id)).toEqual(["b"]);
  });

  test("没有前置 → 空", () => {
    expect(unresolvedPrereqs(task({ id: "me" }), [])).toEqual([]);
  });

  test("前置 id 不存在 → 不返回任何东西（不崩）", () => {
    const target = task({ id: "me", blockedBy: ["ghost"] });
    expect(unresolvedPrereqs(target, [target])).toEqual([]);
  });
});

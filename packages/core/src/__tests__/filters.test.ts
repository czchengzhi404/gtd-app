import { describe, it, expect } from "bun:test";
import { applyListFilter } from "../store/selectors";
import type { Task } from "../models/task";

const NOW = new Date(2026, 9, 27, 10, 0, 0).getTime();
const DAY = 86400000;

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: "任务",
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
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: "0001",
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    ...partial,
  };
}

describe("列表筛选（搜索 / 情境 / 逾期）", () => {
  const tasks = [
    task({ id: "a", title: "写季度报告", notes: "含预算表" }),
    task({ id: "b", title: "打电话给客户", contextIds: ["ctx-phone"] }),
    task({ id: "c", title: "交房租", dueAt: NOW - 2 * DAY }),
    task({ id: "d", title: "已完成的事", status: "done", dueAt: NOW - 3 * DAY }),
  ];

  it("关键词同时匹配标题与笔记", () => {
    expect(applyListFilter(tasks, { query: "预算" }, NOW).map((x) => x.id)).toEqual(["a"]);
    expect(applyListFilter(tasks, { query: "报告" }, NOW).map((x) => x.id)).toEqual(["a"]);
  });

  it("关键词大小写不敏感", () => {
    expect(applyListFilter([task({ id: "x", title: "Fix Bug" })], { query: "fix" }, NOW)).toHaveLength(1);
  });

  it("按情境筛选", () => {
    expect(applyListFilter(tasks, { contextId: "ctx-phone" }, NOW).map((x) => x.id)).toEqual(["b"]);
  });

  it("只看逾期：排除已完成与无到期", () => {
    expect(applyListFilter(tasks, { overdueOnly: true }, NOW).map((x) => x.id)).toEqual(["c"]);
  });

  it("组合条件取交集", () => {
    expect(applyListFilter(tasks, { query: "客户", contextId: "ctx-phone" }, NOW)).toHaveLength(1);
    expect(applyListFilter(tasks, { query: "客户", contextId: "ctx-pc" }, NOW)).toHaveLength(0);
  });
});

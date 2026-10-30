import { describe, it, expect } from "bun:test";
import { getInboxTasks, getTodayTasks, getUpcomingGroups, isDeferred } from "../store/selectors";
import { pickTimedNotifications } from "../features/due-scan";
import { buildReviewSummary } from "../features/review";
import type { AppState } from "../store/app-store";
import type { Project, Task } from "../models/task";

const NOW = new Date(2026, 9, 30, 10, 0, 0).getTime();
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
    tags: [],
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

function project(partial: Partial<Project> & { id: string }): Project {
  return {
    name: "项目",
    description: "",
    kind: "parallel",
    status: "active",
    color: null,
    areaId: null,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 30 * DAY,
    revision: 1,
    deletedAt: null,
    ...partial,
  };
}

function state(tasks: Task[], projects: Project[] = []): AppState {
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    projects: Object.fromEntries(projects.map((p) => [p.id, p])),
    sections: {},
    areas: {},
    contexts: {},
    kv: {},
    lastError: null,
  };
}

describe("开始日期（defer）", () => {
  it("未到开始日期的任务从收集箱隐藏", () => {
    const future = task({ id: "a", deferUntil: NOW + 2 * DAY });
    const ready = task({ id: "b" });
    const s = state([future, ready]);
    expect(getInboxTasks(s, NOW).map((t) => t.id)).toEqual(["b"]);
  });

  it("到了开始日期后重新出现", () => {
    const later = task({ id: "a", deferUntil: NOW + 2 * DAY });
    const s = state([later]);
    expect(getInboxTasks(s, NOW + 3 * DAY).map((t) => t.id)).toEqual(["a"]);
  });

  it("今天视图同样过滤被推迟的任务", () => {
    const deferred = task({ id: "a", dueAt: NOW + 3600000, deferUntil: NOW + DAY });
    const s = state([deferred]);
    expect(getTodayTasks(s, NOW)).toHaveLength(0);
  });

  it("isDeferred 的边界：恰好到点即视为可执行", () => {
    const t = task({ id: "a", deferUntil: NOW });
    expect(isDeferred(t, NOW)).toBe(false);
    expect(isDeferred(t, NOW - 1)).toBe(true);
  });
});

describe("未来视图分组", () => {
  it("跳过今天与已完成，按日分组且组内按时刻排序", () => {
    const tomorrow = new Date(2026, 9, 31, 0, 0, 0).getTime();
    const todayTask = task({ id: "today", dueAt: NOW + 3600000 });
    const t1 = task({ id: "d1-late", dueAt: tomorrow + 15 * 3600000 });
    const t2 = task({ id: "d1-early", dueAt: tomorrow + 9 * 3600000 });
    const done = task({ id: "done", status: "done", dueAt: tomorrow + 10 * 3600000 });
    const deferred = task({ id: "deferred", dueAt: tomorrow + 11 * 3600000, deferUntil: NOW + 10 * DAY });

    const groups = getUpcomingGroups(state([todayTask, t1, t2, done, deferred]), NOW, 14);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks.map((task) => task.id)).toEqual(["d1-early", "d1-late"]);
  });

  it("超出窗口范围的任务不出现", () => {
    const far = task({ id: "far", dueAt: NOW + 30 * DAY });
    expect(getUpcomingGroups(state([far]), NOW, 14)).toHaveLength(0);
  });
});

describe("任务级时间提醒", () => {
  it("到点时刻落在窗口内才提醒一次", () => {
    const at3pm = new Date(2026, 9, 30, 15, 0, 0).getTime();
    const timed = task({ id: "call", title: "打电话", dueAt: at3pm });
    const s = [timed];

    // 未到点
    expect(pickTimedNotifications(s, at3pm - 60000, new Set()).due).toHaveLength(0);
    // 到点后 1 分钟 → 提醒
    const first = pickTimedNotifications(s, at3pm + 60000, new Set());
    expect(first.due.map((d) => d.taskId)).toEqual(["call"]);
    // 已提醒过 → 不重复
    expect(pickTimedNotifications(s, at3pm + 120000, new Set(first.newKeys)).due).toHaveLength(0);
    // 超出窗口（>5 分钟）→ 不提醒
    expect(pickTimedNotifications(s, at3pm + 6 * 60000, new Set()).due).toHaveLength(0);
  });

  it("仅日期（默认 18:00）的任务交给每日概览，不触发时刻提醒", () => {
    const defaultDue = new Date(2026, 9, 30, 18, 0, 0).getTime();
    const t = task({ id: "a", dueAt: defaultDue });
    expect(pickTimedNotifications([t], defaultDue + 60000, new Set()).due).toHaveLength(0);
  });
});

describe("项目回顾周期", () => {
  it("超过周期未回顾的项目进入待回顾清单，超期久的排前面", () => {
    const stale = project({ id: "p1", name: "装修", lastReviewedAt: NOW - 20 * DAY, reviewIntervalDays: 7 });
    const fresh = project({ id: "p2", name: "学习", lastReviewedAt: NOW - 2 * DAY, reviewIntervalDays: 7 });
    const never = project({ id: "p3", name: "旅行" }); // createdAt 30 天前，从未回顾

    const summary = buildReviewSummary(state([], [stale, fresh, never]), NOW);
    const ids = summary.projectsDueForReview.map((p) => p.projectId);
    expect(ids).toContain("p1");
    expect(ids).toContain("p3");
    expect(ids).not.toContain("p2");
    // 从未回顾（30 天）应排在 20 天之前
    expect(ids.indexOf("p3")).toBeLessThan(ids.indexOf("p1"));
  });
});

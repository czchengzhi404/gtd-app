import { describe, expect, test } from "bun:test";

import { classifyQuadrant, groupByQuadrant, QUADRANTS } from "../features/matrix";
import { computeStats } from "../features/stats";
import type { Context, Project, Task } from "../models/task";
import type { AppState } from "../store/app-store";

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime(); // 2026-11-01 10:00 本地时间
const DAY = 86_400_000;
const HOUR = 3_600_000;

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
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    ...partial,
  };
}

function context(partial: Partial<Context> & { id: string }): Context {
  return {
    name: `情境${partial.id}`,
    color: null,
    icon: null,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    ...partial,
  };
}

function state(
  tasks: Task[],
  projects: Project[] = [],
  contexts: Context[] = [],
): AppState {
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
    projects: Object.fromEntries(projects.map((item) => [item.id, item])),
    sections: {},
    contexts: Object.fromEntries(contexts.map((item) => [item.id, item])),
    areas: {},
    templates: {},
    kv: {},
    lastError: null,
  };
}

describe("computeStats · 7/30 天窗口与日桶", () => {
  const tasks = [
    task({
      id: "today",
      status: "done",
      completedAt: NOW - 1 * HOUR,
      createdAt: NOW - 10 * DAY,
      projectId: "p1",
      contextIds: ["c1"],
    }),
    task({
      id: "yesterday",
      status: "done",
      completedAt: NOW - 1 * DAY,
      createdAt: NOW - 20 * DAY,
    }),
    task({
      id: "five-days",
      status: "done",
      completedAt: NOW - 5 * DAY,
      createdAt: NOW - 40 * DAY,
    }),
    task({
      id: "ten-days",
      status: "done",
      completedAt: NOW - 10 * DAY,
      createdAt: NOW - 50 * DAY,
    }),
    task({
      id: "forty-days",
      status: "done",
      completedAt: NOW - 40 * DAY,
      createdAt: NOW - 60 * DAY,
    }),
    task({ id: "open-2d", status: "next", createdAt: NOW - 2 * DAY, projectId: "p1", contextIds: ["c1"] }),
    task({ id: "open-1d", status: "next", createdAt: NOW - 1 * DAY, contextIds: ["c1"] }),
    task({ id: "open-old", status: "waiting", createdAt: NOW - 20 * DAY }),
  ];

  test("7 天与 30 天完成数、完成率、吞吐", () => {
    const stats = computeStats(state(tasks, [project({ id: "p1", name: "发布" })], [context({ id: "c1", name: "电脑" })]), NOW);
    expect(stats.completed7d).toBe(3);
    expect(stats.completed30d).toBe(4);
    expect(stats.completionRate7d).toBe(0.6);
    expect(stats.throughputPerDay).toBe(0.43);
  });

  test("streak 从今天或昨天向前连续计数", () => {
    const stats = computeStats(state(tasks), NOW);
    expect(stats.streakDays).toBe(2);
  });

  test("dailyBuckets 含今天共 7 天，按最早→最新排序并统计完成/创建", () => {
    const stats = computeStats(state(tasks), NOW);
    expect(stats.dailyBuckets).toHaveLength(7);
    expect(stats.dailyBuckets[6]?.dayStart).toBe(new Date(2026, 10, 1).getTime());
    expect(stats.dailyBuckets.map((bucket) => bucket.completed)).toEqual([0, 1, 0, 0, 0, 1, 1]);
    expect(stats.dailyBuckets.map((bucket) => bucket.created)).toEqual([0, 0, 0, 0, 1, 1, 0]);
    const threeDays = computeStats(state(tasks), NOW, { days: 3 });
    expect(threeDays.dailyBuckets).toHaveLength(3);
  });

  test("byProject / byContext 统计未完成与已完成", () => {
    const stats = computeStats(
      state(tasks, [project({ id: "p1", name: "发布" }), project({ id: "p2", name: "空项目" })], [
        context({ id: "c1", name: "电脑" }),
      ]),
      NOW,
    );
    expect(stats.byProject).toEqual([
      { id: "p1", name: "发布", open: 1, done: 1 },
      { id: "p2", name: "空项目", open: 0, done: 0 },
    ]);
    expect(stats.byContext).toEqual([{ id: "c1", name: "电脑", open: 2 }]);
  });

  test("空库返回全 0 且日桶固定长度", () => {
    const stats = computeStats(state([]), NOW);
    expect(stats).toEqual({
      completed7d: 0,
      completed30d: 0,
      completionRate7d: 0,
      streakDays: 0,
      dailyBuckets: Array.from({ length: 7 }, (_, index) => ({
        dayStart: new Date(2026, 9, 26).getTime() + index * DAY,
        completed: 0,
        created: 0,
      })),
      byProject: [],
      byContext: [],
      throughputPerDay: 0,
    });
  });
});

describe("classifyQuadrant · 四象限边界", () => {
  test("48 小时边界含等号，逾期也算紧急", () => {
    expect(classifyQuadrant(task({ id: "boundary", dueAt: NOW + 48 * HOUR }), NOW)).toBe("q3");
    expect(classifyQuadrant(task({ id: "beyond", dueAt: NOW + 48 * HOUR + 1 }), NOW)).toBe("q4");
    expect(classifyQuadrant(task({ id: "overdue", dueAt: NOW - HOUR }), NOW)).toBe("q3");
    expect(
      classifyQuadrant(task({ id: "overdue-important", priority: 2, dueAt: NOW - HOUR }), NOW),
    ).toBe("q1");
  });

  test("星级与优先级构成重要性；无紧迫性时进 q2", () => {
    expect(classifyQuadrant(task({ id: "star", starred: true }), NOW)).toBe("q2");
    expect(classifyQuadrant(task({ id: "priority", priority: 2 }), NOW)).toBe("q2");
    expect(classifyQuadrant(task({ id: "plain" }), NOW)).toBe("q4");
  });

  test("有 dueAt 且属于活跃项目 → 重要；项目已归档则只看紧急性", () => {
    const projects = {
      active: project({ id: "active", status: "active" }),
      archived: project({ id: "archived", status: "done" }),
    };
    expect(
      classifyQuadrant(task({ id: "active-task", projectId: "active", dueAt: NOW + 72 * HOUR }), NOW, projects),
    ).toBe("q2");
    expect(
      classifyQuadrant(task({ id: "active-soon", projectId: "active", dueAt: NOW + 24 * HOUR }), NOW, projects),
    ).toBe("q1");
    expect(
      classifyQuadrant(
        task({ id: "archived-task", projectId: "archived", dueAt: NOW + 24 * HOUR }),
        NOW,
        projects,
      ),
    ).toBe("q3");
  });

  test("groupByQuadrant 固定返回 q1..q4（空组也返回），过滤墓碑", () => {
    const groups = groupByQuadrant(
      [
        task({ id: "q1", priority: 3, dueAt: NOW + HOUR }),
        task({ id: "q2", starred: true }),
        task({ id: "q3", dueAt: NOW + HOUR }),
        task({ id: "q4" }),
        task({ id: "deleted", priority: 3, dueAt: NOW + HOUR, deletedAt: NOW }),
      ],
      NOW,
    );
    expect(Object.keys(groups)).toEqual([...QUADRANTS]);
    expect(groups.q1.map((item) => item.id)).toEqual(["q1"]);
    expect(groups.q2.map((item) => item.id)).toEqual(["q2"]);
    expect(groups.q3.map((item) => item.id)).toEqual(["q3"]);
    expect(groups.q4.map((item) => item.id)).toEqual(["q4"]);
    expect(groupByQuadrant([], NOW).q1).toEqual([]);
  });
});

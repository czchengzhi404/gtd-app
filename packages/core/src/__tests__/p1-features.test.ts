import { describe, expect, test } from "bun:test";

import {
  applyListFilter,
  getAllTags,
  normalizeTag,
  normalizeTags,
  parseQuickAdd,
  selectProjectsByArea,
} from "../index";
import type { AppState, Area, Project, Task } from "../index";

const NOW = new Date(2026, 9, 30, 10, 0, 0).getTime();

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

function area(partial: Partial<Area> & { id: string }): Area {
  return {
    name: `区域${partial.id}`,
    color: null,
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
    name: `项目${partial.id}`,
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

function makeState(tasks: Task[], projects: Project[] = [], areas: Area[] = []): AppState {
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    projects: Object.fromEntries(projects.map((p) => [p.id, p])),
    sections: {},
    areas: Object.fromEntries(areas.map((a) => [a.id, a])),
    contexts: {},
    kv: {},
    lastError: null,
  };
}

describe("P1: 标签归一化", () => {
  test("去 # 前缀、压空白、去保留字符", () => {
    expect(normalizeTag("#紧急")).toBe("紧急");
    expect(normalizeTag("  工作 相关  ")).toBe("工作-相关");
    expect(normalizeTag("a@b+c>d!e")).toBe("a-b-c-d-e");
    expect(normalizeTag("---")).toBe("");
    expect(normalizeTag("")).toBe("");
  });

  test("限长 24 字符", () => {
    expect(normalizeTag("x".repeat(30)).length).toBe(24);
  });

  test("批量：去空、不区分大小写去重、保序", () => {
    expect(normalizeTags(["a", "A", "b", "", "  ", "a"])).toEqual(["a", "b"]);
    expect(normalizeTags(["#工作", "工作"])).toEqual(["工作"]);
  });
});

describe("P1: 快速添加 +标签", () => {
  test("+紧急 +等审批 进入 parsed.tags 并被归一化", () => {
    const parsed = parseQuickAdd("交报表 +紧急 +等审批 @电脑 明天", NOW);
    expect(parsed.tags).toEqual(["紧急", "等审批"]);
    expect(parsed.contextNames).toEqual(["电脑"]);
    expect(parsed.title).toBe("交报表");
  });
});

describe("P1: 按标签筛选", () => {
  test("applyListFilter 命中 tags；null = 不限", () => {
    const tasks = [
      task({ id: "t1", title: "A", tags: ["紧急"] }),
      task({ id: "t2", title: "B", tags: ["工作"] }),
    ];
    expect(applyListFilter(tasks, { tag: "紧急" }, NOW).map((t) => t.id)).toEqual(["t1"]);
    expect(applyListFilter(tasks, { tag: "工作" }, NOW).map((t) => t.id)).toEqual(["t2"]);
    expect(applyListFilter(tasks, { tag: null }, NOW).length).toBe(2);
  });

  test("getAllTags 汇总去重排序", () => {
    const tasks = [
      task({ id: "t1", title: "A", tags: ["b", "a"] }),
      task({ id: "t2", title: "B", tags: ["A"] }),
    ];
    expect(getAllTags(makeState(tasks))).toEqual(["a", "b"]);
  });
});

describe("P1: 区域分组", () => {
  test("按区域分组；未分组殿后；空区域不出现", () => {
    const areas = [area({ id: "a1", orderKey: "0001" }), area({ id: "a2", orderKey: "0002" })];
    const projects = [project({ id: "p1", areaId: "a2" }), project({ id: "p2", areaId: null }), project({ id: "p3", areaId: "a1" })];
    const groups = selectProjectsByArea(makeState([], projects, areas));
    expect(groups.map((g) => g.area?.id ?? null)).toEqual(["a1", "a2", null]);
    expect(groups[0]?.projects.map((p) => p.id)).toEqual(["p3"]);
    expect(groups[2]?.projects.map((p) => p.id)).toEqual(["p2"]);
  });

  test("区域被软删除后项目回落未分组", () => {
    const deleted = area({ id: "a1", deletedAt: 1 });
    const projects = [project({ id: "p1", areaId: "a1" })];
    const groups = selectProjectsByArea(makeState([], projects, [deleted]));
    expect(groups.map((g) => g.area?.id ?? null)).toEqual([null]);
    expect(groups[0]?.projects.map((p) => p.id)).toEqual(["p1"]);
  });
});

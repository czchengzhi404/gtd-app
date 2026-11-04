import { describe, expect, test } from "bun:test";

import { clarifyOptions, clarifyProgress, recommendedClarify } from "../features/clarify";
import { searchAll } from "../features/search";
import type { Area, Context, Project, Task } from "../models/task";
import type { AppState } from "../store/app-store";

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime(); // 2026-11-01 10:00 本地时间
const DAY = 86_400_000;

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

function state(
  tasks: Task[],
  projects: Project[] = [],
  contexts: Context[] = [],
  areas: Area[] = [],
): AppState {
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
    projects: Object.fromEntries(projects.map((item) => [item.id, item])),
    sections: {},
    contexts: Object.fromEntries(contexts.map((item) => [item.id, item])),
    areas: Object.fromEntries(areas.map((item) => [item.id, item])),
    templates: {},
    kv: {},
    lastError: null,
  };
}

describe("searchAll · 排序层级", () => {
  const ctxFix = context({ id: "ctx-fix", name: "fix" });
  const tasks = [
    task({ id: "exact", title: "fix", updatedAt: NOW - 10 * DAY }),
    task({ id: "prefix", title: "fix bug", updatedAt: NOW - 9 * DAY }),
    task({ id: "contains", title: "please fix this", updatedAt: NOW - 8 * DAY }),
    task({ id: "notes", title: "无关", notes: "please fix this later", updatedAt: NOW - 7 * DAY }),
    task({ id: "tag", title: "无关", tags: ["fix"], updatedAt: NOW - 1 * DAY }),
    task({ id: "context", title: "无关", contextIds: ["ctx-fix"], updatedAt: NOW - 2 * DAY }),
    task({ id: "prefix-old", title: "fix old", updatedAt: NOW - 30 * DAY }),
    task({ id: "prefix-new", title: "fix new", updatedAt: NOW - 3 * DAY }),
  ];

  test("100 > 70 > 50 > 30 > 25，同分按 updatedAt 降序", () => {
    const result = searchAll(state(tasks, [], [ctxFix]), "fix", NOW);
    expect(result.tasks.map((hit) => hit.id)).toEqual([
      "exact",
      "prefix-new",
      "prefix",
      "prefix-old",
      "contains",
      "notes",
      "tag",
      "context",
    ]);
    expect(result.tasks.map((hit) => hit.score)).toEqual([100, 70, 70, 70, 50, 30, 25, 25]);
    expect(result.tasks.map((hit) => hit.matchedField)).toEqual([
      "title",
      "title",
      "title",
      "title",
      "title",
      "notes",
      "tag",
      "context",
    ]);
    expect(result.total).toBe(8);
  });

  test("项目按名称/描述命中，任务与项目分别排序后合计 total", () => {
    const projects = [
      project({ id: "p-prefix", name: "fix project", updatedAt: NOW - 1 * DAY }),
      project({ id: "p-notes", name: "Alpha", description: "fix later", updatedAt: NOW - 2 * DAY }),
    ];
    const result = searchAll(state([task({ id: "t1", title: "fix" })], projects), "fix", NOW);
    expect(result.tasks).toHaveLength(1);
    expect(result.projects.map((hit) => hit.id)).toEqual(["p-prefix", "p-notes"]);
    expect(result.projects.map((hit) => hit.matchedField)).toEqual(["title", "notes"]);
    expect(result.total).toBe(3);
  });
});

describe("searchAll · 空 query / snippet / 中英混排", () => {
  test("空 query 或纯空白返回空结果", () => {
    const result = searchAll(state([task({ id: "t1", title: "fix" })]), "   ", NOW);
    expect(result).toEqual({ tasks: [], projects: [], total: 0 });
    expect(searchAll(state([]), "", NOW).total).toBe(0);
  });

  test("snippet 取命中前后各 20 字并压空白", () => {
    const notes = `${"A".repeat(30)}\n\n  needle \t ${"B".repeat(30)}`;
    const result = searchAll(state([task({ id: "t1", title: "无关", notes })]), "needle", NOW);
    const hit = result.tasks[0];
    expect(hit).toBeDefined();
    expect(hit?.snippet).toContain("needle");
    expect(hit?.snippet).not.toContain("\n");
    expect(hit?.snippet).not.toContain("\t");
    expect((hit?.snippet.length ?? 0) <= 46).toBe(true);
  });

  test("中英混排与大小写不敏感", () => {
    const tasks = [task({ id: "t1", title: "修复 Bug 报告" })];
    expect(searchAll(state(tasks), "BUG", NOW).tasks[0]?.score).toBe(50);
    expect(searchAll(state(tasks), "修复", NOW).tasks[0]?.score).toBe(70);
    expect(searchAll(state(tasks), "修复 bug", NOW).tasks[0]?.score).toBe(70);
    expect(searchAll(state(tasks), "bug 报告", NOW).tasks[0]?.score).toBe(50);
  });
});

describe("clarify · 决策树", () => {
  test("clarifyOptions 返回固定 9 项，recommended 唯一且与 recommendedClarify 一致", () => {
    const item = task({ id: "t1", tags: ["2分钟"] });
    const options = clarifyOptions(item, NOW);
    expect(options.map((option) => option.key)).toEqual([
      "next",
      "waiting",
      "someday",
      "done",
      "trash",
      "twoMinute",
      "delegate",
      "project",
      "defer",
    ]);
    expect(options.filter((option) => option.recommended).map((option) => option.key)).toEqual([
      "twoMinute",
    ]);
    for (const option of options) {
      expect(option.labelKey.startsWith("clarify.action.")).toBe(true);
      expect(option.hintKey.startsWith("clarify.action.")).toBe(true);
    }
    expect(recommendedClarify(item, NOW)).toEqual({
      action: "twoMinute",
      reasonCode: "clarify.reason.twoMinute",
    });
  });

  test("各条规则可解释：deleted/done/waiting/twoMinute/project/someday/defer/overdue", () => {
    expect(recommendedClarify(task({ id: "t1", deletedAt: NOW }), NOW)).toEqual({
      action: "trash",
      reasonCode: "clarify.reason.deleted",
    });
    expect(recommendedClarify(task({ id: "t2", status: "done" }), NOW)).toEqual({
      action: "done",
      reasonCode: "clarify.reason.done",
    });
    expect(recommendedClarify(task({ id: "t2b", status: "waiting" }), NOW)).toEqual({
      action: "waiting",
      reasonCode: "clarify.reason.statusWaiting",
    });
    expect(recommendedClarify(task({ id: "t2c", status: "someday" }), NOW)).toEqual({
      action: "someday",
      reasonCode: "clarify.reason.statusSomeday",
    });
    expect(recommendedClarify(task({ id: "t2d", status: "next" }), NOW)).toEqual({
      action: "next",
      reasonCode: "clarify.reason.statusNext",
    });
    expect(recommendedClarify(task({ id: "t3", waitingFor: "张三" }), NOW)).toEqual({
      action: "waiting",
      reasonCode: "clarify.reason.waiting",
    });
    expect(
      recommendedClarify(task({ id: "t4", title: "用 2 分钟整理桌面" }), NOW),
    ).toEqual({ action: "twoMinute", reasonCode: "clarify.reason.twoMinute" });
    expect(recommendedClarify(task({ id: "t5", tags: ["2min"] }), NOW)).toEqual({
      action: "twoMinute",
      reasonCode: "clarify.reason.twoMinute",
    });
    expect(
      recommendedClarify(
        task({
          id: "t6",
          projectId: null,
          notes: "- 第一步\n- 第二步\n- 第三步",
        }),
        NOW,
      ),
    ).toEqual({ action: "project", reasonCode: "clarify.reason.multiStep" });
    expect(
      recommendedClarify(
        task({
          id: "t7",
          checklist: [
            { id: "c1", title: "a", done: false, orderKey: "1" },
            { id: "c2", title: "b", done: false, orderKey: "2" },
          ],
        }),
        NOW,
      ),
    ).toEqual({ action: "project", reasonCode: "clarify.reason.multiStep" });
    expect(recommendedClarify(task({ id: "t8" }), NOW)).toEqual({
      action: "someday",
      reasonCode: "clarify.reason.noDueNoProject",
    });
    expect(recommendedClarify(task({ id: "t9", dueAt: NOW + 3 * DAY }), NOW)).toEqual({
      action: "defer",
      reasonCode: "clarify.reason.dueWithin7Days",
    });
    expect(recommendedClarify(task({ id: "t10", dueAt: NOW - 1 * DAY }), NOW)).toEqual({
      action: "next",
      reasonCode: "clarify.reason.overdue",
    });
    expect(
      recommendedClarify(task({ id: "t11", projectId: "p1", dueAt: NOW + 10 * DAY }), NOW),
    ).toEqual({ action: "next", reasonCode: "clarify.reason.actionable" });
  });

  test("2 分钟识别不误伤 12 分钟", () => {
    expect(recommendedClarify(task({ id: "t1", title: "12 分钟跑完" }), NOW).action).toBe(
      "someday",
    );
    expect(recommendedClarify(task({ id: "t2", title: "2 分钟回复" }), NOW).action).toBe(
      "twoMinute",
    );
  });
});

describe("clarifyProgress · 收集箱统计", () => {
  test("inboxCount 排除 defer 与墓碑，processedToday 只看今天离开 inbox 的更新", () => {
    const tasks = [
      task({ id: "old", status: "inbox", createdAt: NOW - 3 * DAY }),
      task({ id: "new", status: "inbox", createdAt: NOW - 1 * DAY }),
      task({
        id: "deferred",
        status: "inbox",
        deferUntil: NOW + DAY,
        createdAt: NOW - 10 * DAY,
      }),
      task({ id: "processed", status: "next", updatedAt: NOW - 2 * 3600_000 }),
      task({ id: "old-processed", status: "next", updatedAt: NOW - 5 * DAY }),
      task({ id: "done-old", status: "done", updatedAt: NOW - 5 * DAY }),
      task({ id: "deleted", status: "inbox", createdAt: NOW - 20 * DAY, deletedAt: NOW }),
    ];
    expect(clarifyProgress(state(tasks), NOW)).toEqual({
      inboxCount: 2,
      processedToday: 1,
      oldestInboxAgeDays: 3,
    });
  });

  test("空库返回 0", () => {
    expect(clarifyProgress(state([]), NOW)).toEqual({
      inboxCount: 0,
      processedToday: 0,
      oldestInboxAgeDays: 0,
    });
  });
});

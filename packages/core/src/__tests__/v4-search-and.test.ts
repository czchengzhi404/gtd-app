import { describe, expect, test } from "bun:test";

import { searchAll, tokenizeQuery } from "../features/search";
import type { AppState } from "../store/app-store";
import type { Context, Project, Task } from "../models/task";

const NOW = 1_760_000_000_000;

function baseRecord(id: string, updatedAt = NOW) {
  return {
    id,
    createdAt: NOW,
    updatedAt,
    revision: 1,
    deletedAt: null,
  };
}

function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    ...baseRecord(partial.id),
    title: "未命名",
    notes: "",
    status: "next",
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
    orderKey: "a",
    ...partial,
  } as Task;
}

function makeProject(partial: Partial<Project> & { id: string }): Project {
  return {
    ...baseRecord(partial.id),
    name: "未命名项目",
    description: "",
    kind: "parallel",
    status: "active",
    color: null,
    areaId: null,
    reviewIntervalDays: 7,
    lastReviewedAt: null,
    ...partial,
  } as Project;
}

function makeState(tasks: Task[], projects: Project[] = [], contexts: Context[] = []): AppState {
  const index = <T extends { id: string }>(items: T[]): Record<string, T> => {
    const map: Record<string, T> = {};
    for (const item of items) map[item.id] = item;
    return map;
  };
  return {
    loaded: true,
    tasks: index(tasks),
    projects: index(projects),
    sections: {},
    contexts: index(contexts),
    areas: {},
    templates: {},
    kv: {},
    lastError: null,
  };
}

describe("tokenizeQuery", () => {
  test("按空白切词", () => {
    expect(tokenizeQuery("雨 比喻")).toEqual(["雨", "比喻"]);
  });

  test("压缩连续空白并去空", () => {
    expect(tokenizeQuery("  雨   比喻  ")).toEqual(["雨", "比喻"]);
  });

  test("按小写去重，保留首次原形", () => {
    expect(tokenizeQuery("Rain rain RAIN")).toEqual(["Rain"]);
  });

  test("空串返回空数组", () => {
    expect(tokenizeQuery("   ")).toEqual([]);
  });
});

describe("searchAll · 单词（回归）", () => {
  const state = makeState([
    makeTask({ id: "t1", title: "写周报" }),
    makeTask({ id: "t2", title: "写周报的模板" }),
    makeTask({ id: "t3", title: "买菜", notes: "顺便写周报" }),
  ]);

  test("标题全等 100 分", () => {
    const result = searchAll(state, "写周报", NOW);
    expect(result.tasks[0]?.id).toBe("t1");
    expect(result.tasks[0]?.score).toBe(100);
  });

  test("标题前缀 70 分", () => {
    const result = searchAll(state, "写周", NOW);
    expect(result.tasks.find((hit) => hit.id === "t1")?.score).toBe(70);
  });

  test("笔记命中 30 分", () => {
    const result = searchAll(state, "顺便", NOW);
    expect(result.tasks[0]?.id).toBe("t3");
    expect(result.tasks[0]?.matchedField).toBe("notes");
  });

  test("空查询返回空结果", () => {
    expect(searchAll(state, "   ", NOW).total).toBe(0);
  });
});

describe("searchAll · 多词 AND", () => {
  test("两个词都在正文（不相邻）也命中", () => {
    const state = makeState([
      makeTask({ id: "t1", title: "随笔", notes: "雨下得很大，像一场比喻" }),
      makeTask({ id: "t2", title: "无关", notes: "只有雨" }),
    ]);
    const result = searchAll(state, "雨 比喻", NOW);
    expect(result.tasks.map((hit) => hit.id)).toEqual(["t1"]);
  });

  test("有一个词不存在 → 整条不命中", () => {
    const state = makeState([makeTask({ id: "t1", title: "随笔", notes: "只有雨" })]);
    expect(searchAll(state, "雨 比喻", NOW).total).toBe(0);
  });

  test("两个词分别命中不同字段也算命中（标题+正文）", () => {
    const state = makeState([makeTask({ id: "t1", title: "雨", notes: "关于比喻的笔记" })]);
    const result = searchAll(state, "雨 比喻", NOW);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.matchedField).toBe("title");
  });

  test("总分取各词最低分（最弱词决定相关性）", () => {
    const state = makeState([makeTask({ id: "t1", title: "雨", notes: "比喻在这里" })]);
    // 「雨」标题全等 100，「比喻」正文 30 → 取 30
    expect(searchAll(state, "雨 比喻", NOW).tasks[0]?.score).toBe(30);
  });

  test("词序不影响命中（但摘要围绕第一个词）", () => {
    const state = makeState([makeTask({ id: "t1", title: "雨", notes: "比喻" })]);
    const a = searchAll(state, "雨 比喻", NOW);
    const b = searchAll(state, "比喻 雨", NOW);
    expect(a.tasks).toHaveLength(1);
    expect(b.tasks).toHaveLength(1);
    expect(a.tasks[0]?.snippet).toContain("雨");
  });
});

describe("searchAll · scope", () => {
  const state = makeState([makeTask({ id: "t1", title: "标题有雨", notes: "正文也有雨" })]);

  test("scope=title 只看标题", () => {
    expect(searchAll(state, "雨", NOW, { scope: "title" }).tasks).toHaveLength(1);
    expect(searchAll(state, "不存在", NOW, { scope: "title" }).tasks).toHaveLength(0);
  });

  test("scope=notes 时标题命中不算", () => {
    const onlyTitle = makeState([makeTask({ id: "t2", title: "只有标题" })]);
    expect(searchAll(onlyTitle, "只有标题", NOW, { scope: "notes" }).tasks).toHaveLength(0);
    expect(searchAll(onlyTitle, "只有标题", NOW, { scope: "title" }).tasks).toHaveLength(1);
  });

  test("scope=notes 时正文命中算", () => {
    const onlyNotes = makeState([makeTask({ id: "t3", title: "无关", notes: "正文里有目标词" })]);
    expect(searchAll(onlyNotes, "目标词", NOW, { scope: "notes" }).tasks).toHaveLength(1);
  });
});

describe("searchAll · 项目与上下文", () => {
  test("项目名与描述都能搜到", () => {
    const state = makeState([], [makeProject({ id: "p1", name: "长篇小说", description: "关于雨的故事" })]);
    expect(searchAll(state, "小说", NOW).projects).toHaveLength(1);
    expect(searchAll(state, "雨", NOW).projects[0]?.matchedField).toBe("notes");
  });

  test("情境名可命中任务", () => {
    const state = makeState(
      [makeTask({ id: "t1", title: "写稿", contextIds: ["c1"] })],
      [],
      [{ ...baseRecord("c1"), name: "书房", color: null, icon: null } as Context],
    );
    const result = searchAll(state, "书房", NOW);
    expect(result.tasks[0]?.matchedField).toBe("context");
  });

  test("已删除的任务与项目不出现", () => {
    const state = makeState(
      [makeTask({ id: "t1", title: "雨", deletedAt: NOW })],
      [makeProject({ id: "p1", name: "雨", deletedAt: NOW })],
    );
    expect(searchAll(state, "雨", NOW).total).toBe(0);
  });

  test("同分按 updatedAt 降序（最近改动优先）", () => {
    const state = makeState([
      makeTask({ id: "old", title: "雨", updatedAt: NOW - 1000 }),
      makeTask({ id: "new", title: "雨", updatedAt: NOW }),
    ]);
    expect(searchAll(state, "雨", NOW).tasks[0]?.id).toBe("new");
  });
});

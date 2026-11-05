import { describe, expect, test } from "bun:test";

import { toMarkdown } from "../features/exporters";
import { parseMarkdownTasks } from "../features/importers";
import type { AppState } from "../store/app-store";
import type { Task } from "../models/task";

const NOW = 1_760_000_000_000;

function at(year: number, month: number, day: number, hour = 18, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function makeTask(partial: Partial<Task> & { id: string }): Task {
  const { id, ...rest } = partial;
  return {
    id,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    title: "任务",
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
    ...rest,
  } as Task;
}

function stateWith(tasks: Task[]): AppState {
  const map: Record<string, Task> = {};
  for (const task of tasks) map[task.id] = task;
  return {
    loaded: true,
    tasks: map,
    projects: {},
    sections: {},
    contexts: {},
    areas: {},
    templates: {},
    kv: {},
    lastError: null,
  };
}

describe("toMarkdown · 到期时刻", () => {
  test("只有日期（18:00 约定）时输出纯日期", () => {
    const md = toMarkdown(stateWith([makeTask({ id: "t1", title: "交稿", dueAt: at(2026, 11, 7) })]));
    expect(md).toContain("📅 2026-11-07");
    expect(md).not.toContain("18:00");
  });

  test("带具体时刻时输出日期 + 时刻", () => {
    const md = toMarkdown(
      stateWith([makeTask({ id: "t1", title: "开会", dueAt: at(2026, 11, 7, 15, 30) })]),
    );
    expect(md).toContain("📅 2026-11-07 15:30");
  });

  test("00:00 也保留（不是约定时刻）", () => {
    const md = toMarkdown(stateWith([makeTask({ id: "t1", title: "跨天", dueAt: at(2026, 11, 7, 0, 0) })]));
    expect(md).toContain("📅 2026-11-07 00:00");
  });
});

describe("toMarkdown · 已完成任务", () => {
  test("默认不导出已完成", () => {
    const md = toMarkdown(
      stateWith([makeTask({ id: "t1", title: "待办" }), makeTask({ id: "t2", title: "已完成", status: "done" })]),
    );
    expect(md).toContain("待办");
    expect(md).not.toContain("已完成");
  });

  test("includeCompleted 打开后导出为 [x]", () => {
    const md = toMarkdown(
      stateWith([makeTask({ id: "t2", title: "已完成", status: "done" })]),
      { includeCompleted: true },
    );
    expect(md).toContain("- [x] 已完成");
  });
});

describe("往返：导出 → 导入", () => {
  test("纯日期任务往返后到期日不变（且不产生时刻）", () => {
    const md = toMarkdown(stateWith([makeTask({ id: "t1", title: "交稿", dueAt: at(2026, 11, 7) })]));
    const plan = parseMarkdownTasks(md, NOW);
    const draft = plan.tasks[0];
    expect(draft?.title).toBe("交稿");
    // 导入侧默认 18:00，与导出的"只有日期"语义一致
    expect(new Date(draft?.dueAt ?? 0).getHours()).toBe(18);
  });
});

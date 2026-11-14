import { describe, expect, test } from "bun:test";

import { appStore, applyRecords } from "../store/app-store";
import type { TaggedRecord } from "../models/commands";
import type { Task } from "../models/task";

const NOW = 1_700_000_000_000;

function legacyTask(id: string): Record<string, unknown> {
  return {
    id,
    title: `旧记录 ${id}`,
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
    // 故意没有 blockedBy：老版本导出的 JSON 就是这样
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: "0001",
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
  };
}

describe("applyRecords · 旧记录归一化", () => {
  test("缺 blockedBy 的导入记录进 store 后被补成空数组", () => {
    appStore.setState({ tasks: {} });
    applyRecords([{ type: "task", record: legacyTask("a") } as unknown as TaggedRecord]);
    const stored = appStore.getState().tasks["a"] as Task;
    expect(stored.id).toBe("a");
    expect(Array.isArray(stored.blockedBy)).toBe(true);
    expect(stored.blockedBy).toEqual([]);
  });

  test("已有 blockedBy 的记录原样保留", () => {
    appStore.setState({ tasks: {} });
    const record = { ...legacyTask("b"), blockedBy: ["x", "y"] };
    applyRecords([{ type: "task", record } as unknown as TaggedRecord]);
    expect((appStore.getState().tasks["b"] as Task).blockedBy).toEqual(["x", "y"]);
  });

  test("其它数组字段缺失也一并补齐（contextIds/tags/checklist）", () => {
    appStore.setState({ tasks: {} });
    const record = legacyTask("c");
    delete record.contextIds;
    delete record.tags;
    delete record.checklist;
    applyRecords([{ type: "task", record } as unknown as TaggedRecord]);
    const stored = appStore.getState().tasks["c"] as Task;
    expect(stored.contextIds).toEqual([]);
    expect(stored.tags).toEqual([]);
    expect(stored.checklist).toEqual([]);
  });
});

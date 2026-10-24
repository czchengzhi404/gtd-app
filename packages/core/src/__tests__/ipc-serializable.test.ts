import { describe, it, expect } from "bun:test";
import {
  taskCreatePayloadSchema,
  taskUpdatePayloadSchema,
  taskMoveStatusPayloadSchema,
  taskReorderPayloadSchema,
  taskCompletePayloadSchema,
  idOnlyPayloadSchema,
  projectUpsertPayloadSchema,
  contextUpsertPayloadSchema,
  sectionCreatePayloadSchema,
  settingsSetPayloadSchema,
  recordsApplyPayloadSchema,
  type CommandMap,
} from "../models/commands";

/**
 * IPC 可序列化纪律：每个命令 payload 的代表性 fixture 必须能通过
 * structuredClone 往返（Electron IPC 的结构化克隆算法）。任何包含函数、
 * 类实例、循环引用的 payload 设计都会在此测试中失败。
 */
const FIXTURES: { [K in keyof CommandMap]: CommandMap[K] } = {
  "task.create": {
    title: "给花园浇水 @外出 !2 明天",
    notes: "# 笔记\n- 要点",
    status: "inbox",
    priority: 2,
    dueAt: 1_900_000_000_000,
    projectId: null,
    sectionId: null,
    contextIds: ["ctx-outdoor"],
    waitingFor: null,
    starred: true,
    recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3], until: null },
    checklist: [{ id: "c1", title: "接水管", done: false, orderKey: "0000" }],
  },
  "task.update": {
    id: "t1",
    patch: { title: "改名后的任务", starred: true, dueAt: null, contextIds: ["ctx-pc"] },
  },
  "task.moveStatus": { id: "t1", status: "next" },
  "task.reorder": { idsInOrder: ["t2", "t1", "t3"] },
  "task.complete": { id: "t1" },
  "task.uncomplete": { id: "t1" },
  "task.softDelete": { id: "t1" },
  "project.upsert": {
    name: "装修房子",
    description: "顺序项目",
    kind: "sequential",
    status: "active",
    color: null,
  },
  "project.softDelete": { id: "p1" },
  "context.upsert": { name: "电脑", color: null, icon: null },
  "section.create": { projectId: "p1", name: "设计" },
  "sync.applyRemote": {
    records: [
      {
        type: "task",
        record: {
          id: "t-remote",
          title: "远端任务",
          notes: "",
          status: "next",
          priority: 1,
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
          orderKey: "",
          createdAt: 1_900_000_000_000,
          updatedAt: 1_900_000_000_000,
          revision: 3,
          deletedAt: null,
        },
      },
    ],
  },
  "import.merge": { records: [] },
  "settings.set": { key: "theme", value: "dark" },
};

const SCHEMAS = {
  "task.create": taskCreatePayloadSchema,
  "task.update": taskUpdatePayloadSchema,
  "task.moveStatus": taskMoveStatusPayloadSchema,
  "task.reorder": taskReorderPayloadSchema,
  "task.complete": taskCompletePayloadSchema,
  "task.uncomplete": taskCompletePayloadSchema,
  "task.softDelete": idOnlyPayloadSchema,
  "project.upsert": projectUpsertPayloadSchema,
  "project.softDelete": idOnlyPayloadSchema,
  "context.upsert": contextUpsertPayloadSchema,
  "section.create": sectionCreatePayloadSchema,
  "sync.applyRemote": recordsApplyPayloadSchema,
  "import.merge": recordsApplyPayloadSchema,
  "settings.set": settingsSetPayloadSchema,
} as const;

describe("IPC 可序列化纪律", () => {
  for (const op of Object.keys(FIXTURES) as (keyof CommandMap)[]) {
    it(`${op} payload 可 structuredClone 往返且 schema 校验通过`, () => {
      const fixture = FIXTURES[op];
      const roundTripped = structuredClone(fixture);
      expect(roundTripped).toEqual(fixture);

      const schema = SCHEMAS[op] as never;
      const parsed = (schema as { parse: (v: unknown) => unknown }).parse(roundTripped);
      expect(parsed).toEqual(fixture);
    });
  }

  it("payload 含函数时 structuredClone 抛错（守护测试本身有效）", () => {
    expect(() => structuredClone({ bad: () => 1 })).toThrow();
  });
});

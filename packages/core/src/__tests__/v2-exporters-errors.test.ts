import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { formatBackupJSON, toBackupJSON, toICS, toMarkdown } from "../features/exporters";
import { AppError, toAppError } from "../models/errors";
import { executeCommand } from "../db/commands";
import { COMMAND_REGISTRY } from "../db/commands";
import type { CommandOp } from "../models/commands";
import type { Task } from "../models/task";
import type { SqliteExecutor } from "../platform/executor";
import type { AppState } from "../store/app-store";

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime(); // 2026-11-01 10:00 本地时间

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

function state(tasks: Task[], kv: Record<string, string> = {}): AppState {
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
    projects: {},
    sections: {},
    contexts: {},
    areas: {},
    templates: {},
    kv,
    lastError: null,
  };
}

function fakeExecutor(overrides: Partial<SqliteExecutor> = {}): SqliteExecutor {
  const executor: SqliteExecutor = {
    query: async () => [],
    run: async () => ({ changes: 1 }),
    transaction: async <T>(fn: (tx: SqliteExecutor) => Promise<T>) => fn(executor),
    ...overrides,
  };
  return executor;
}

describe("toMarkdown · 分组与转义", () => {
  const exportState: AppState = {
    loaded: true,
    tasks: {
      t1: task({
        id: "t1",
        title: "修 [紧急] bug",
        notes: "先复现\n再修复",
        priority: 3,
        dueAt: new Date(2026, 10, 5, 18, 0).getTime(),
        tags: ["发布"],
        contextIds: ["c1"],
        projectId: "p1",
        orderKey: "0001",
      }),
      t2: task({ id: "t2", title: "买牛奶", orderKey: "0002" }),
      t3: task({ id: "t3", title: "已完成的事", status: "done", projectId: "p1", orderKey: "0003" }),
      t4: task({ id: "t4", title: "整理书架", projectId: "p2", orderKey: "0004" }),
    },
    projects: {
      p1: { id: "p1", name: "发布 v2", description: "", kind: "parallel", status: "active", color: null, areaId: "a1", reviewIntervalDays: 7, lastReviewedAt: null, createdAt: NOW, updatedAt: NOW, revision: 1, deletedAt: null },
      p2: { id: "p2", name: "生活", description: "", kind: "parallel", status: "active", color: null, areaId: null, reviewIntervalDays: 7, lastReviewedAt: null, createdAt: NOW, updatedAt: NOW, revision: 1, deletedAt: null },
    },
    sections: {},
    contexts: {
      c1: { id: "c1", name: "电脑", color: null, icon: null, createdAt: NOW, updatedAt: NOW, revision: 1, deletedAt: null },
    },
    areas: {
      a1: { id: "a1", name: "工作", color: null, orderKey: "0001", createdAt: NOW, updatedAt: NOW, revision: 1, deletedAt: null },
    },
    templates: {},
    kv: {},
    lastError: null,
  };

  test("按区域 → 项目 → 任务分组，含到期日/标签/情境/优先级", () => {
    const markdown = toMarkdown(exportState);
    expect(markdown).toContain("# GTD 清单");
    expect(markdown).toContain("## 工作");
    expect(markdown).toContain("### 发布 v2");
    expect(markdown).toContain("- [ ] 修 \\[紧急\\] bug 📅 2026-11-05 !!! #发布 @电脑");
    expect(markdown).toContain("## 未归类");
    expect(markdown).toContain("### 生活");
    expect(markdown).toContain("### 收集箱");
    expect(markdown).toContain("- [ ] 买牛奶");
    expect(markdown).not.toContain("已完成的事");
  });

  test("includeCompleted / includeNotes 可开启；空 state 只有标题", () => {
    const markdown = toMarkdown(exportState, { includeCompleted: true, includeNotes: true });
    expect(markdown).toContain("- [x] 已完成的事");
    expect(markdown).toContain("  > 先复现 再修复");
    expect(toMarkdown(state([]))).toBe("# GTD 清单\n");
  });
});

describe("toICS · CRLF / 折行 / 转义", () => {
  test("UID/DTSTART/DTEND/DTSTAMP 与文本转义", () => {
    const item = task({
      id: "t1",
      title: "评审; 需求, 发布\\上线\n第二行",
      notes: "备注; 含逗号,",
      dueAt: new Date(2026, 10, 5, 18, 0).getTime(),
    });
    const ics = toICS([item], NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:t1@gtd");
    expect(ics).toContain("DTSTART:20261105T180000");
    expect(ics).toContain("DTEND:20261105T183000");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain("SUMMARY:评审\\; 需求\\, 发布\\\\上线\\n第二行");
    expect(ics).toContain("DESCRIPTION:备注\\; 含逗号\\,");
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  test("75 octet 折行：每行不超限、续行以空格开头、展开后还原标题", () => {
    const longTitle = "很长的中文标题".repeat(30);
    const ics = toICS(
      [task({ id: "long", title: longTitle, dueAt: new Date(2026, 10, 5, 18, 0).getTime() })],
      NOW,
    );
    const lines = ics.split("\r\n").filter((line) => line.length > 0);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75);
    }
    const unfolded = lines
      .map((line) => (line.startsWith(" ") ? line.slice(1) : line))
      .join("");
    expect(unfolded).toContain(`SUMMARY:${longTitle}`);
  });

  test("无 dueAt 的任务不生成事件", () => {
    const ics = toICS([task({ id: "no-date" })], NOW);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });
});

describe("toBackupJSON · 稳定字段顺序", () => {
  test("信封与 importFromFile 一致、按 id 排序、2 空格缩进、与插入顺序无关", () => {
    const a = task({ id: "b", title: "B", orderKey: "0002" });
    const b = task({ id: "a", title: "A", orderKey: "0001" });
    const one = toBackupJSON(state([a, b], { z: "2", a: "1" }), NOW);
    const two = toBackupJSON(state([b, a], { a: "1", z: "2" }), NOW);
    expect(one).toBe(two);
    expect(one).toContain('\n  "app": "gtd"');

    const parsed = JSON.parse(one) as {
      app: string;
      version: number;
      exportedAt: number;
      records: { type: string; record: { id: string } }[];
    };
    expect(parsed.app).toBe("gtd");
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe(NOW);
    expect(parsed.records.map((item) => item.record.id)).toEqual(["a", "b"]);
    expect(parsed.records.every((item) => item.type === "task")).toBe(true);
    expect(Object.keys(parsed.records[0]?.record as object)).toEqual([
      "id",
      "title",
      "notes",
      "status",
      "priority",
      "deferUntil",
      "dueAt",
      "completedAt",
      "lastCompletedAt",
      "projectId",
      "sectionId",
      "contextIds",
      "tags",
      "waitingFor",
      "starred",
      "recurrence",
      "checklist",
      "orderKey",
      "createdAt",
      "updatedAt",
      "revision",
      "deletedAt",
    ]);
  });

  test("formatBackupJSON 与 importFromFile 的信封字段一致", () => {
    const records = [{ type: "task" as const, record: task({ id: "x" }) }];
    const text = formatBackupJSON(records, NOW);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["app", "version", "exportedAt", "records"]);
    expect((parsed.records as unknown[]).length).toBe(1);
  });
});

describe("命令注册表 · 显式覆盖", () => {
  test("23 个 op 全部有 schema 与 handler", () => {
    const entries = Object.entries(COMMAND_REGISTRY);
    expect(entries).toHaveLength(23);
    for (const [, definition] of entries) {
      expect(typeof definition.schema.parse).toBe("function");
      expect(typeof definition.handler).toBe("function");
    }
  });
});

describe("AppError · 命令层包装", () => {
  test("AppError 构造与 toAppError 幂等", () => {
    const error = new AppError("conflict", "版本冲突", { id: "t1" });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("conflict");
    expect(error.details).toEqual({ id: "t1" });
    expect(toAppError(error)).toBe(error);
  });

  test("ZodError → validation_failed，保留 message 与 issues；普通错误保留原始 message", () => {
    const zodError = new ZodError([
      { code: "custom", path: ["title"], message: "标题必填" },
    ]);
    const wrapped = toAppError(zodError);
    expect(wrapped.code).toBe("validation_failed");
    expect(wrapped.message).toContain("标题必填");
    expect(wrapped.details?.originalMessage).toBe(zodError.message);
    expect(Array.isArray(wrapped.details?.issues)).toBe(true);
    expect((wrapped.details?.issues as unknown[]).length).toBe(1);

    const notFound = toAppError(new Error("task not found: t1"));
    expect(notFound.code).toBe("not_found");
    expect(notFound.message).toBe("task not found: t1");

    const unknown = toAppError("boom");
    expect(unknown.code).toBe("unknown");
    expect(unknown.message).toBe("boom");
  });

  test("executeCommand：zod 校验失败 → AppError(validation_failed)", async () => {
    let caught: unknown;
    try {
      await executeCommand(fakeExecutor(), "task.create", { title: "" }, { now: () => NOW });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe("validation_failed");
    expect(appError.message.length).toBeGreaterThan(0);
  });

  test("executeCommand：handler 抛出的 not_found 包装为 AppError 且保留 message", async () => {
    let caught: unknown;
    try {
      await executeCommand(
        fakeExecutor(),
        "task.update",
        { id: "missing", patch: {} },
        { now: () => NOW },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe("not_found");
    expect(appError.message).toBe("task not found: missing");
  });

  test("executeCommand：存储错误分类为 storage_failed；未注册 op 直接拒绝", async () => {
    const failing = fakeExecutor({
      run: async () => {
        throw new Error("SQLITE_FULL: database or disk is full");
      },
    });
    let caught: unknown;
    try {
      await executeCommand(failing, "settings.set", { key: "k", value: 1 }, { now: () => NOW });
    } catch (err) {
      caught = err;
    }
    expect((caught as AppError).code).toBe("storage_failed");
    expect((caught as AppError).message).toContain("SQLITE_FULL");

    let missingOp: unknown;
    try {
      await executeCommand(fakeExecutor(), "nope" as CommandOp, {}, { now: () => NOW });
    } catch (err) {
      missingOp = err;
    }
    expect(missingOp).toBeInstanceOf(AppError);
    expect((missingOp as AppError).code).toBe("validation_failed");
    expect((missingOp as AppError).message).toContain("未注册的命令");
  });
});

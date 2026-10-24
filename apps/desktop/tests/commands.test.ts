import { describe, it, expect, beforeEach } from "bun:test";
// better-sqlite3 由 apps/desktop 依赖提供（N-API 预编译，bun 直接可用）
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import type { SqliteExecutor } from "@gtd/core";
import { migrate } from "@gtd/core";
import { executeCommand } from "@gtd/core";
import { loadBootstrapData, getTasks } from "@gtd/core";
import { getTodayTasks, getFocusTasks, getProjectNextAction, appStore, applyRecords } from "@gtd/core";

/**
 * 命令层集成测试：真实 better-sqlite3（与桌面端同一驱动），
 * 覆盖 migrate → create/update/complete(含重复推进)/softDelete → 查询 → bootstrap。
 * 移动端 expo-sqlite 走同一 executeCommand/queries 层，行为一致性由本测试背书。
 */

function makeExecutor(): SqliteExecutor {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  const executor: SqliteExecutor = {
    query: async <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).all(...params) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes };
    },
    transaction: async <T>(fn: (tx: SqliteExecutor) => Promise<T>, mode: "immediate" | "deferred") => {
      db.exec(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = await fn(executor);
        db.exec("COMMIT");
        return result;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return executor;
}

let executor: SqliteExecutor;
const NOW = new Date(2026, 9, 24, 10, 0, 0, 0).getTime();
const ctx = { now: () => NOW };

beforeEach(async () => {
  executor = makeExecutor();
  await migrate(executor);
});

describe("命令层（真实 SQLite）", () => {
  it("task.create → 查询可见，revision=1", async () => {
    const result = await executeCommand(executor, "task.create", { title: "写周报" }, ctx);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.type).toBe("task");
    const task = await getTasks(executor, { status: "inbox" });
    expect(task).toHaveLength(1);
    expect(task[0]?.title).toBe("写周报");
    expect(task[0]?.revision).toBe(1);
  });

  it("task.update → revision+1", async () => {
    const created = await executeCommand(executor, "task.create", { title: "旧标题" }, ctx);
    const id = (created.records[0]?.record as { id: string }).id;
    const updated = await executeCommand(
      executor,
      "task.update",
      { id, patch: { title: "新标题", priority: 2 } },
      ctx,
    );
    const task = updated.records[0]?.record as { title: string; revision: number; priority: number };
    expect(task.title).toBe("新标题");
    expect(task.revision).toBe(2);
    expect(task.priority).toBe(2);
  });

  it("task.complete 普通任务 → done", async () => {
    const created = await executeCommand(executor, "task.create", { title: "一次性" }, ctx);
    const id = (created.records[0]?.record as { id: string }).id;
    const done = await executeCommand(executor, "task.complete", { id }, ctx);
    const task = done.records[0]?.record as { status: string; completedAt: number | null };
    expect(task.status).toBe("done");
    expect(task.completedAt).toBe(NOW);
  });

  it("task.complete 重复任务 → dueAt 推进，status 不变", async () => {
    const due = new Date(2026, 9, 24, 18, 0).getTime();
    const created = await executeCommand(
      executor,
      "task.create",
      { title: "吃药", dueAt: due, recurrence: { freq: "daily", interval: 1, until: null } },
      ctx,
    );
    const id = (created.records[0]?.record as { id: string }).id;
    const done = await executeCommand(executor, "task.complete", { id }, ctx);
    const task = done.records[0]?.record as {
      status: string;
      dueAt: number | null;
      completedAt: number | null;
      lastCompletedAt: number | null;
    };
    expect(task.status).not.toBe("done");
    expect(task.completedAt).toBeNull();
    expect(task.lastCompletedAt).toBe(NOW);
    expect(task.dueAt).toBe(new Date(2026, 9, 25, 18, 0).getTime());
  });

  it("task.softDelete → 墓碑，默认查询不可见", async () => {
    const created = await executeCommand(executor, "task.create", { title: "要删的" }, ctx);
    const id = (created.records[0]?.record as { id: string }).id;
    await executeCommand(executor, "task.softDelete", { id }, ctx);
    const alive = await getTasks(executor, { includeDone: true });
    expect(alive).toHaveLength(0);
  });

  it("context.upsert 幂等：同名复用，@ 前缀被剥离", async () => {
    const first = await executeCommand(executor, "context.upsert", { name: "@电脑" }, ctx);
    const second = await executeCommand(executor, "context.upsert", { name: "电脑" }, ctx);
    const a = first.records[0]?.record as { id: string; name: string };
    const b = second.records[0]?.record as { id: string; name: string };
    expect(a.name).toBe("电脑");
    expect(b.id).toBe(a.id);
  });

  it("project.upsert 按名 find-or-create + section.create", async () => {
    const p1 = await executeCommand(executor, "project.upsert", { name: "装修", kind: "sequential" }, ctx);
    const p2 = await executeCommand(executor, "project.upsert", { name: "装修" }, ctx);
    expect((p1.records[0]?.record as { id: string }).id).toBe((p2.records[0]?.record as { id: string }).id);
    const pid = (p1.records[0]?.record as { id: string }).id;
    const sec = await executeCommand(executor, "section.create", { projectId: pid, name: "硬装" }, ctx);
    expect(sec.records[0]?.type).toBe("section");
  });

  it("payload 校验失败 → 抛错且不落库", async () => {
    expect(
      executeCommand(executor, "task.create", { title: "" }, ctx),
    ).rejects.toThrow();
    const tasks = await getTasks(executor, { includeDone: true });
    expect(tasks).toHaveLength(0);
  });

  it("bootstrap 全量加载 + store 状态派生（今天/专注/项目下一步）", async () => {
    const proj = await executeCommand(executor, "project.upsert", { name: "搬家", kind: "sequential" }, ctx);
    const pid = (proj.records[0]?.record as { id: string }).id;
    await executeCommand(executor, "task.create", { title: "订搬家车", projectId: pid }, ctx);
    await executeCommand(executor, "task.create", { title: "打包书籍", projectId: pid }, ctx);
    await executeCommand(
      executor,
      "task.create",
      { title: "今天到期", dueAt: new Date(2026, 9, 24, 18, 0).getTime(), starred: true },
      ctx,
    );
    await executeCommand(executor, "task.create", { title: "已逾期", dueAt: new Date(2026, 9, 20, 18, 0).getTime() }, ctx);

    const data = await loadBootstrapData(executor);
    appStore.setState({
      loaded: true,
      tasks: Object.fromEntries(data.tasks.map((t) => [t.id, t])),
      projects: Object.fromEntries(data.projects.map((p) => [p.id, p])),
      sections: Object.fromEntries(data.sections.map((s) => [s.id, s])),
      contexts: Object.fromEntries(data.contexts.map((c) => [c.id, c])),
      kv: data.kv,
      lastError: null,
    });
    const state = appStore.getState();
    expect(Object.keys(state.tasks)).toHaveLength(4);

    // 顺序项目下一步 = 第一个未完成项
    const next = getProjectNextAction(state, pid);
    expect(next?.title).toBe("订搬家车");

    // 今天视图：今日到期 + 逾期，不含无到期任务
    const today = getTodayTasks(state, NOW);
    expect(today.map((t) => t.title).sort()).toEqual(["已逾期", "今天到期"].sort());

    // 专注视图：starred 优先
    const focus = getFocusTasks(state, NOW);
    expect(focus[0]?.starred).toBe(true);

    applyRecords([]);
  });
});

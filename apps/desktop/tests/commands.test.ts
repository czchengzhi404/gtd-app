import { describe, it, expect, beforeEach } from "bun:test";
// better-sqlite3 由 apps/desktop 依赖提供（N-API 预编译，bun 直接可用）
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import type { SqliteExecutor } from "@gtd/core";
import { migrate } from "@gtd/core";
import { executeCommand } from "@gtd/core";
import { loadBootstrapData, getTasks, getDeletedTasks, maybeCompactTombstones } from "@gtd/core";
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
      completedAt: number | null;      lastCompletedAt: number | null;
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

  it("回收站：getDeletedTasks 只含墓碑、按删除时间倒序、restore 后消失", async () => {
    const a = await executeCommand(executor, "task.create", { title: "先删的" }, ctx);
    const b = await executeCommand(executor, "task.create", { title: "后删的" }, ctx);
    const idA = (a.records[0]?.record as { id: string }).id;
    const idB = (b.records[0]?.record as { id: string }).id;
    // 不同删除时刻（倒序断言需要可区分的时间戳）
    await executeCommand(executor, "task.softDelete", { id: idA }, ctx);
    await executeCommand(executor, "task.softDelete", { id: idB }, { now: () => NOW + 1000 });

    const deleted = await getDeletedTasks(executor);
    expect(deleted.map((t) => t.title)).toEqual(["后删的", "先删的"]); // 倒序
    expect(deleted.every((t) => t.deletedAt !== null)).toBe(true);

    await executeCommand(executor, "task.restore", { id: idB }, ctx);
    const after = await getDeletedTasks(executor);
    expect(after.map((t) => t.title)).toEqual(["先删的"]);
    const alive = await getTasks(executor, { includeDone: true });
    expect(alive.map((t) => t.title)).toEqual(["后删的"]);
  });

  it("无到期日的重复任务：完成时以完成时刻为锚点推进（文档 §4.3 语义）", async () => {
    const created = await executeCommand(
      executor,
      "task.create",
      { title: "随手记", recurrence: { freq: "daily", interval: 1, until: null } },
      ctx,
    );
    const id = (created.records[0]?.record as { id: string }).id;
    expect((created.records[0]?.record as { dueAt: number | null }).dueAt).toBeNull();
    const done = await executeCommand(executor, "task.complete", { id }, ctx);
    const task = done.records[0]?.record as { status: string; dueAt: number | null };
    expect(task.status).not.toBe("done");
    expect(task.dueAt).not.toBeNull();
    // daily interval=1：锚点 = 完成时刻（ctx.now）→ dueAt = now + 1 天
    expect(task.dueAt).toBe(NOW + 86400000);
  });

  it("墓碑压缩：90 天前的墓碑物理删除，近期墓碑与活记录保留；24h 门控", async () => {
    const old = NOW - 91 * 86400000;
    const recent = NOW - 10 * 86400000;
    // 直接种两个墓碑（绕过命令的 now）
    await executor.run(
      "INSERT INTO tasks (id, title, notes, status, priority, defer_until, due_at, completed_at, last_completed_at, project_id, section_id, context_ids, tags, waiting_for, starred, recurrence, checklist, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, '', 'inbox', 0, NULL, NULL, NULL, NULL, NULL, NULL, '[]', '[]', NULL, 0, NULL, '[]', '0001', ?, ?, 1, ?)",
      ["t-old", "老墓碑", old, old, old],
    );
    await executor.run(
      "INSERT INTO tasks (id, title, notes, status, priority, defer_until, due_at, completed_at, last_completed_at, project_id, section_id, context_ids, tags, waiting_for, starred, recurrence, checklist, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, '', 'inbox', 0, NULL, NULL, NULL, NULL, NULL, NULL, '[]', '[]', NULL, 0, NULL, '[]', '0002', ?, ?, 1, ?)",
      ["t-recent", "新墓碑", recent, recent, recent],
    );
    await executor.run(
      "INSERT INTO tasks (id, title, notes, status, priority, defer_until, due_at, completed_at, last_completed_at, project_id, section_id, context_ids, tags, waiting_for, starred, recurrence, checklist, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, '', 'inbox', 0, NULL, NULL, NULL, NULL, NULL, NULL, '[]', '[]', NULL, 0, NULL, '[]', '0003', ?, ?, 1, NULL)",
      ["t-alive", "活任务", NOW, NOW],
    );

    // 第一次：到期压缩（kv 无标记 → 执行）
    const removed = await maybeCompactTombstones(executor, NOW);
    expect(removed).toBe(1); // 只删老墓碑

    const survivors = await getDeletedTasks(executor);
    expect(survivors.map((t) => t.title)).toEqual(["新墓碑"]);
    const alive = await getTasks(executor, { includeDone: true });
    expect(alive.map((t) => t.title)).toEqual(["活任务"]);

    // 第二次（同日）：门控生效，不再扫表
    const removedAgain = await maybeCompactTombstones(executor, NOW + 3600_000);
    expect(removedAgain).toBe(0);
    expect(await getDeletedTasks(executor)).toHaveLength(1);

    // 跨过 24h：再次执行（近期墓碑仍未到期，不删）
    const removedLater = await maybeCompactTombstones(executor, NOW + 25 * 86400000);
    expect(removedLater).toBe(0);
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

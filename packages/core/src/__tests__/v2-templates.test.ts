import { describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";

import { executeCommand } from "../db/commands";
import { padOrderKey } from "../db/commands/shared";
import { coerceTaggedRecords } from "../db/coerce";
import { migrate } from "../db/migrations";
import { getTasks, getTemplateById, getTemplates, loadBootstrapData } from "../db/queries";
import { AppError } from "../models/errors";
import type { TaggedRecord, TemplateUpsertPayload } from "../models/commands";
import type { Task, TaskTemplate } from "../models/task";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";
import { applyRecords, appStore } from "../store/app-store";
import { collectLocalRecords } from "../sync/service";

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime();

function makeExecutor(db: Database): SqliteExecutor {
  const executor: SqliteExecutor = {
    query: async <T extends SqliteRow>(sql: string, params: readonly unknown[] = []) =>
      db.query(sql).all(...(params as SQLQueryBindings[])) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.run(sql, params as SQLQueryBindings[]);
      return { changes: info.changes };
    },
    transaction: async <T>(
      fn: (tx: SqliteExecutor) => Promise<T>,
      mode: "immediate" | "deferred",
    ) => {
      db.run(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = await fn(executor);
        db.run("COMMIT");
        return result;
      } catch (err) {
        db.run("ROLLBACK");
        throw err;
      }
    },
  };
  return executor;
}

async function setup(): Promise<{ db: Database; executor: SqliteExecutor }> {
  const db = new Database(":memory:");
  const executor = makeExecutor(db);
  await migrate(executor);
  return { db, executor };
}

const ctx = { now: () => NOW };

const TEMPLATE_INPUT: TemplateUpsertPayload = {
  name: "每周回顾",
  title: "做周回顾",
  notes: "## 步骤\n1. 看收件箱\n2. 看等待中",
  priority: 2,
  projectId: "p-review",
  contextIds: ["ctx-pc"],
  tags: ["例行"],
  checklist: [
    { id: "c1", title: "看收件箱", done: false, orderKey: "0001" },
    { id: "c2", title: "看等待中", done: true, orderKey: "0002" },
  ],
  recurrence: { freq: "weekly", interval: 1, byWeekday: [5] },
};

async function createTemplate(executor: SqliteExecutor): Promise<TaskTemplate> {
  const result = await executeCommand(executor, "template.upsert", TEMPLATE_INPUT, ctx);
  const record = result.records[0]?.record;
  expect(record).toBeDefined();
  return record as TaskTemplate;
}

function remoteTemplate(
  id: string,
  revision: number,
  deletedAt: number | null = null,
): TaggedRecord {
  const template: TaskTemplate = {
    id,
    name: `远端模板 ${id}`,
    title: "远端标题",
    notes: "",
    priority: 1,
    projectId: null,
    contextIds: [],
    tags: [],
    checklist: [],
    recurrence: null,
    createdAt: NOW,
    updatedAt: NOW,
    revision,
    deletedAt,
  };
  return { type: "template", record: template };
}

describe("template.upsert · 创建 / 更新 / 同名复用", () => {
  test("无 id 创建：revision=1、全部字段落库并可原样读回", async () => {
    const { executor } = await setup();
    const template = await createTemplate(executor);

    expect(template.revision).toBe(1);
    expect(template.deletedAt).toBeNull();
    expect(template.createdAt).toBe(NOW);
    expect(template.updatedAt).toBe(NOW);
    expect(template.name).toBe("每周回顾");
    expect(template.title).toBe("做周回顾");
    expect(template.notes).toBe(TEMPLATE_INPUT.notes ?? "");
    expect(template.priority).toBe(2);
    expect(template.projectId).toBe("p-review");
    expect(template.contextIds).toEqual(["ctx-pc"]);
    expect(template.tags).toEqual(["例行"]);
    expect(template.checklist).toHaveLength(2);
    expect(template.recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [5] });

    expect(await getTemplates(executor)).toEqual([template]);
  });

  test("同名未删除模板视为同一条：更新而非新建，revision+1，省略字段保留", async () => {
    const { executor } = await setup();
    const first = await createTemplate(executor);

    const second = await executeCommand(
      executor,
      "template.upsert",
      { name: "每周回顾", title: "改为周复盘" },
      ctx,
    );
    const updated = second.records[0]?.record as TaskTemplate;
    expect(updated.id).toBe(first.id);
    expect(updated.title).toBe("改为周复盘");
    expect(updated.revision).toBe(2);
    expect(updated.createdAt).toBe(first.createdAt);
    // 省略的字段保留原值
    expect(updated.notes).toBe(TEMPLATE_INPUT.notes ?? "");
    expect(updated.priority).toBe(2);
    expect(updated.checklist).toHaveLength(2);

    expect(await getTemplates(executor)).toHaveLength(1);
  });

  test("有 id 按 id 更新（改名也算），revision 递增", async () => {
    const { executor } = await setup();
    const created = await createTemplate(executor);

    const result = await executeCommand(
      executor,
      "template.upsert",
      { id: created.id, name: "改名后的模板", title: "新标题" },
      ctx,
    );
    const updated = result.records[0]?.record as TaskTemplate;
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("改名后的模板");
    expect(updated.title).toBe("新标题");
    expect(updated.revision).toBe(created.revision + 1);

    const reloaded = await getTemplateById(executor, created.id);
    expect(reloaded).toEqual(updated);
  });

  test("同名但已软删除：按名 upsert 会新建一条（墓碑不算同名）", async () => {
    const { executor } = await setup();
    const first = await createTemplate(executor);
    await executeCommand(executor, "template.softDelete", { id: first.id }, ctx);

    const second = await createTemplate(executor);
    expect(second.id).not.toBe(first.id);
    expect(second.revision).toBe(1);
    expect(await getTemplates(executor)).toHaveLength(1);
    expect(await getTemplates(executor, true)).toHaveLength(2);
  });
});

describe("template.instantiate · 从模板新建任务", () => {
  test("复制全部字段、checklist 重新生成 id、只返回 task、模板 revision 不变", async () => {
    const { executor } = await setup();
    const template = await createTemplate(executor);

    const result = await executeCommand(executor, "template.instantiate", { id: template.id }, ctx);
    expect(result.records).toHaveLength(1);
    const tagged = result.records[0]!;
    expect(tagged.type).toBe("task");
    const task = tagged.record as Task;

    expect(result.ids).toEqual([task.id]);
    expect(task.id).not.toBe(template.id);
    expect(task.status).toBe("inbox");
    expect(task.title).toBe(template.title);
    expect(task.notes).toBe(template.notes);
    expect(task.priority).toBe(template.priority);
    expect(task.projectId).toBe(template.projectId);
    expect(task.contextIds).toEqual(template.contextIds);
    expect(task.tags).toEqual(template.tags);
    expect(task.recurrence).toEqual(template.recurrence);
    expect(task.recurrence).not.toBe(template.recurrence);
    expect(task.deferUntil).toBeNull();
    expect(task.dueAt).toBeNull();
    expect(task.orderKey).toBe(padOrderKey(NOW));
    expect(task.revision).toBe(1);

    // checklist：标题/顺序/完成态复制，但子项 id 全部重新生成
    expect(task.checklist.map((item) => item.title)).toEqual(
      template.checklist.map((item) => item.title),
    );
    expect(task.checklist.map((item) => item.done)).toEqual(
      template.checklist.map((item) => item.done),
    );
    const templateItemIds = new Set(template.checklist.map((item) => item.id));
    for (const item of task.checklist) {
      expect(templateItemIds.has(item.id)).toBe(false);
    }

    // 任务已落库
    const tasks = await getTasks(executor, { includeDone: true });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe(task.id);

    // 模板未被修改：revision / updatedAt 原样
    const reloaded = await getTemplateById(executor, template.id);
    expect(reloaded?.revision).toBe(template.revision);
    expect(reloaded?.updatedAt).toBe(template.updatedAt);
  });

  test("连续实例化的两条任务不共享子项 id", async () => {
    const { executor } = await setup();
    const template = await createTemplate(executor);

    const first = (
      await executeCommand(executor, "template.instantiate", { id: template.id }, ctx)
    ).records[0]?.record as Task;
    const second = (
      await executeCommand(executor, "template.instantiate", { id: template.id }, ctx)
    ).records[0]?.record as Task;

    expect(first.id).not.toBe(second.id);
    expect(first.checklist.map((item) => item.id)).not.toEqual(
      second.checklist.map((item) => item.id),
    );
    expect(await getTasks(executor, { includeDone: true })).toHaveLength(2);
  });

  test("模板不存在 / 已删除 → AppError(not_found)", async () => {
    const { executor } = await setup();

    let missing: unknown;
    try {
      await executeCommand(executor, "template.instantiate", { id: "no-such-template" }, ctx);
    } catch (err) {
      missing = err;
    }
    expect(missing).toBeInstanceOf(AppError);
    expect((missing as AppError).code).toBe("not_found");

    const template = await createTemplate(executor);
    await executeCommand(executor, "template.softDelete", { id: template.id }, ctx);
    let deleted: unknown;
    try {
      await executeCommand(executor, "template.instantiate", { id: template.id }, ctx);
    } catch (err) {
      deleted = err;
    }
    expect(deleted).toBeInstanceOf(AppError);
    expect((deleted as AppError).code).toBe("not_found");
    // 失败不留下任务
    expect(await getTasks(executor, { includeDone: true })).toHaveLength(0);
  });
});

describe("template.softDelete · 墓碑", () => {
  test("墓碑 revision+1、bootstrap 不再返回、includeDeleted 仍可见", async () => {
    const { db, executor } = await setup();
    const template = await createTemplate(executor);

    const result = await executeCommand(executor, "template.softDelete", { id: template.id }, ctx);
    const tombstone = result.records[0]?.record as TaskTemplate;
    expect(result.records[0]?.type).toBe("template");
    expect(tombstone.id).toBe(template.id);
    expect(tombstone.deletedAt).toBe(NOW);
    expect(tombstone.updatedAt).toBe(NOW);
    expect(tombstone.revision).toBe(template.revision + 1);

    expect(await getTemplates(executor)).toEqual([]);
    const withDeleted = await getTemplates(executor, true);
    expect(withDeleted).toHaveLength(1);
    expect(withDeleted[0]?.deletedAt).toBe(NOW);

    const bootstrap = await loadBootstrapData(executor);
    expect(bootstrap.templates).toEqual([]);

    const row = db
      .query("SELECT deleted_at, revision FROM task_templates WHERE id = ?")
      .get(template.id) as { deleted_at: number; revision: number };
    expect(row.deleted_at).toBe(NOW);
    expect(row.revision).toBe(template.revision + 1);
  });

  test("重复软删除 → not_found（墓碑不作为可删对象）", async () => {
    const { executor } = await setup();
    const template = await createTemplate(executor);
    await executeCommand(executor, "template.softDelete", { id: template.id }, ctx);

    let caught: unknown;
    try {
      await executeCommand(executor, "template.softDelete", { id: template.id }, ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("not_found");
  });
});

describe("migrations · v5 任务模板表", () => {
  test("v4 → v5：建表 + 索引 + 版本号推进，v1–v4 不受影响", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run("INSERT INTO meta (key, value) VALUES ('schema_version', '4')");
    const executor = makeExecutor(db);

    const applied = await migrate(executor);
    expect(applied).toBe(1);

    const columns = db.query("PRAGMA table_info(task_templates)").all() as { name: string }[];
    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "name",
      "title",
      "notes",
      "priority",
      "project_id",
      "context_ids",
      "tags",
      "checklist",
      "recurrence",
      "created_at",
      "updated_at",
      "revision",
      "deleted_at",
    ]);

    const indexes = db
      .query("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'task_templates'")
      .all() as { name: string }[];
    expect(indexes.map((index) => index.name)).toContain("idx_task_templates_active");

    const version = db
      .query("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(version.value).toBe("5");

    db.close();
  });

  test("全新库迁移到 v5：可直接 upsert 模板", async () => {
    const { executor } = await setup();
    const template = await createTemplate(executor);
    expect(await getTemplateById(executor, template.id)).toEqual(template);
  });
});

describe("同步 · 模板记录收集与合并", () => {
  test("collectLocalRecords 收集模板（含墓碑）", async () => {
    const { executor } = await setup();
    const kept = await createTemplate(executor);
    const deleted = await executeCommand(
      executor,
      "template.upsert",
      { name: "临时模板", title: "临时" },
      ctx,
    );
    const deletedId = (deleted.records[0]?.record as TaskTemplate).id;
    await executeCommand(executor, "template.softDelete", { id: deletedId }, ctx);

    const records = await collectLocalRecords(executor);
    const templates = records.filter((record) => record.type === "template");
    expect(templates).toHaveLength(2);
    const byId = new Map(templates.map((record) => [record.record.id, record.record]));
    expect(byId.get(kept.id)?.deletedAt).toBeNull();
    expect(byId.get(deletedId)?.deletedAt).toBe(NOW);
  });

  test("sync.applyRemote：按 revision 合并模板，墓碑胜出后本地不可见", async () => {
    const { executor } = await setup();

    const applied = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [remoteTemplate("tpl-remote", 3)] },
      ctx,
    );
    expect(applied.records).toHaveLength(1);
    expect(applied.records[0]?.type).toBe("template");
    expect((await getTemplates(executor)).map((item) => item.id)).toEqual(["tpl-remote"]);

    // 低 revision 不覆盖本地
    const stale = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [remoteTemplate("tpl-remote", 2)] },
      ctx,
    );
    expect(stale.records).toHaveLength(0);
    expect((await getTemplateById(executor, "tpl-remote"))?.revision).toBe(3);

    // 高 revision 墓碑胜出
    const tomb = await executeCommand(
      executor,
      "sync.applyRemote",
      { records: [remoteTemplate("tpl-remote", 4, NOW)] },
      ctx,
    );
    expect(tomb.records).toHaveLength(1);
    expect(await getTemplates(executor)).toEqual([]);
    expect(await getTemplates(executor, true)).toHaveLength(1);
  });

  test("coerce：非法模板记录被丢弃，合法记录补默认值", () => {
    const coerced = coerceTaggedRecords([
      { type: "template", record: { id: "" } },
      { type: "template", record: null },
      { type: "not-a-type", record: { id: "x" } },
      {
        type: "template",
        record: {
          id: "tpl-coerced",
          name: "x".repeat(300),
          title: "标题",
          priority: 9,
          contextIds: ["c1", 42],
          recurrence: { freq: "weekdays", interval: 0 },
          checklist: [{ id: "c1", title: "子项", done: 1, orderKey: "0001" }, { title: "无 id" }],
          revision: 0,
        },
      },
    ]);
    expect(coerced).toHaveLength(1);
    const record = coerced[0]?.record as TaskTemplate;
    expect(record.id).toBe("tpl-coerced");
    expect(record.name).toHaveLength(200);
    expect(record.priority).toBe(0);
    expect(record.contextIds).toEqual(["c1"]);
    expect(record.notes).toBe("");
    expect(record.revision).toBe(1);
    expect(record.recurrence).toEqual({ freq: "weekdays", interval: 1 });
    expect(record.checklist).toHaveLength(1);
    expect(record.checklist[0]?.done).toBe(true);
  });
});

describe("app-store · templates 状态切片", () => {
  test("applyRecords 写入活跃模板，墓碑从状态中移除", async () => {
    const { executor } = await setup();
    const template = await createTemplate(executor);

    applyRecords([{ type: "template", record: template }]);
    expect(appStore.getState().templates[template.id]).toEqual(template);

    applyRecords([{ type: "template", record: { ...template, deletedAt: NOW, revision: 2 } }]);
    expect(appStore.getState().templates[template.id]).toBeUndefined();
    expect(Object.keys(appStore.getState().templates)).toHaveLength(0);
  });
});

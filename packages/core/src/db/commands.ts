import type { CommandMap, CommandOp, CommandResult, TaggedRecord } from "../models/commands";
import type {
  Area,
  AttachmentMeta,
  ChecklistItem,
  Context,
  Project,
  RecurrenceRule,
  Section,
  Task,
  TaskStatusInput,
} from "../models/task";
import { uuidv7 } from "./ids";
import {
  areaFromRow,
  areaToParams,
  attachmentFromRow,
  attachmentToParams,
  contextToParams,
  projectToParams,
  sectionToParams,
  taskFromRow,
  taskToParams,
  contextFromRow,
  projectFromRow,
  sectionFromRow,
} from "./mappers";
import { coerceTaggedRecords } from "./coerce";
import { mergeOne } from "../sync/merge";
import type { ManifestEntry } from "../sync/types";
import { nextOccurrence } from "../features/recurrence";
import { findContextByName, findProjectByName, getTaskById } from "./queries";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";
import {
  areaUpsertPayloadSchema,
  attachmentAddPayloadSchema,
  contextUpsertPayloadSchema,
  idOnlyPayloadSchema,
  projectUpsertPayloadSchema,
  recordsApplyPayloadSchema,
  sectionCreatePayloadSchema,
  settingsSetPayloadSchema,
  taskCompletePayloadSchema,
  taskCreatePayloadSchema,
  taskMoveStatusPayloadSchema,
  taskReorderPayloadSchema,
  taskUpdatePayloadSchema,
  type TaggedRecord as TaggedRecordType,
} from "../models/commands";
import { z } from "zod";

/**
 * 命令实现。事务边界 = 命令边界：executeCommand 统一在 immediate 事务中
 * 执行 handler（端口契约见 platform/executor.ts）。handler 内不做任何
 * 与数据库无关的异步等待（保证桌面端主进程同线程串行语义）。
 *
 * SQL 纪律：单一静态字符串字面量 + 参数绑定；exec/prepare 不接受变量 SQL。
 */

export interface CommandContext {
  /** 可注入时钟（测试确定性）；生产传 () => Date.now() */
  now: () => number;
}

type Handler<K extends CommandOp> = (
  tx: SqliteExecutor,
  payload: CommandMap[K],
  ctx: CommandContext,
) => Promise<TaggedRecord[]>;

function tagTask(task: Task): TaggedRecord {
  return { type: "task", record: task };
}

function padOrderKey(n: number): string {
  return String(n).padStart(15, "0");
}

async function getTaskRow(tx: SqliteExecutor, id: string): Promise<Task | null> {
  const rows = await tx.query<SqliteRow>(
    "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return rows.length > 0 ? taskFromRow(rows[0] as SqliteRow) : null;
}

const SQL_INSERT_TASK =
  "INSERT INTO tasks (id, title, notes, status, priority, defer_until, due_at, completed_at, last_completed_at, project_id, section_id, context_ids, tags, waiting_for, starred, recurrence, checklist, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
const SQL_UPDATE_TASK =
  "UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, defer_until = ?, due_at = ?, completed_at = ?, last_completed_at = ?, project_id = ?, section_id = ?, context_ids = ?, tags = ?, waiting_for = ?, starred = ?, recurrence = ?, checklist = ?, order_key = ?, updated_at = ?, revision = ?, deleted_at = ? WHERE id = ?";

function taskUpdateParams(task: Task): unknown[] {
  // 与 SQL_UPDATE_TASK 列序一一对应（不使用索引偏移，避免加列时错位）
  return [
    task.title,
    task.notes,
    task.status,
    task.priority,
    task.deferUntil,
    task.dueAt,
    task.completedAt,
    task.lastCompletedAt,
    task.projectId,
    task.sectionId,
    JSON.stringify(task.contextIds),
    JSON.stringify(task.tags),
    task.waitingFor,
    task.starred ? 1 : 0,
    task.recurrence ? JSON.stringify(task.recurrence) : null,
    JSON.stringify(task.checklist),
    task.orderKey,
    task.updatedAt,
    task.revision,
    task.deletedAt,
    task.id,
  ];
}

/** 按 id 读取任意类型记录（含墓碑——合并需要看到墓碑参与决胜） */
async function readAnyRecord(
  tx: SqliteExecutor,
  type: TaggedRecordType["type"],
  id: string,
): Promise<TaggedRecordType | null> {
  let rows: SqliteRow[];
  if (type === "task") {
    rows = await tx.query<SqliteRow>("SELECT * FROM tasks WHERE id = ?", [id]);
  } else if (type === "project") {
    rows = await tx.query<SqliteRow>("SELECT * FROM projects WHERE id = ?", [id]);
  } else if (type === "section") {
    rows = await tx.query<SqliteRow>("SELECT * FROM sections WHERE id = ?", [id]);
  } else if (type === "context") {
    rows = await tx.query<SqliteRow>("SELECT * FROM contexts WHERE id = ?", [id]);
  } else if (type === "area") {
    rows = await tx.query<SqliteRow>("SELECT * FROM areas WHERE id = ?", [id]);
  } else {
    rows = await tx.query<SqliteRow>("SELECT * FROM attachments WHERE id = ?", [id]);
  }
  if (rows.length === 0) return null;
  const row = rows[0] as SqliteRow;
  switch (type) {
    case "task":
      return { type, record: taskFromRow(row) };
    case "project":
      return { type, record: projectFromRow(row) };
    case "section":
      return { type, record: sectionFromRow(row) };
    case "context":
      return { type, record: contextFromRow(row) };
    case "area":
      return { type, record: areaFromRow(row) };
    case "attachment":
      return { type, record: attachmentFromRow(row) };
  }
}

/** 原样写入远端记录（保留其 revision/updatedAt/deletedAt——合并收敛依赖原值） */
async function writeRawRecord(tx: SqliteExecutor, tagged: TaggedRecordType): Promise<void> {
  const { type, record } = tagged;
  switch (type) {
    case "task":
      await tx.run(
        "INSERT OR REPLACE INTO tasks (id, title, notes, status, priority, defer_until, due_at, completed_at, last_completed_at, project_id, section_id, context_ids, tags, waiting_for, starred, recurrence, checklist, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        taskToParams(record as Parameters<typeof taskToParams>[0]),
      );
      return;
    case "project":
      await tx.run(
        "INSERT OR REPLACE INTO projects (id, name, description, kind, status, color, area_id, review_interval_days, last_reviewed_at, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        projectToParams(record as Parameters<typeof projectToParams>[0]),
      );
      return;
    case "area":
      await tx.run(
        "INSERT OR REPLACE INTO areas (id, name, color, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        areaToParams(record as Parameters<typeof areaToParams>[0]),
      );
      return;
    case "section":
      await tx.run(
        "INSERT OR REPLACE INTO sections (id, project_id, name, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        sectionToParams(record as Parameters<typeof sectionToParams>[0]),
      );
      return;
    case "context":
      await tx.run(
        "INSERT OR REPLACE INTO contexts (id, name, color, icon, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        contextToParams(record as Parameters<typeof contextToParams>[0]),
      );
      return;
    case "attachment":
      await tx.run(
        "INSERT OR REPLACE INTO attachments (id, task_id, file_name, mime_type, size, storage_path, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        attachmentToParams(record as Parameters<typeof attachmentToParams>[0]),
      );
      return;
  }
}

/**
 * 应用一批远端/导入记录：逐条按 revision → updatedAt → id 规则合并，
 * 胜出者原样写入。返回实际应用的记录（本地被远端更新的那些）。
 * 调用方（SyncService）按 200–500 条/批分块，每批 = 本命令 = 一个独立
 * immediate 事务；绝不与用户命令共享事务边界。
 */
async function applyRemoteRecords(
  tx: SqliteExecutor,
  payload: { records: { type: TaggedRecordType["type"]; record: Record<string, unknown> }[] },
): Promise<TaggedRecordType[]> {
  const incoming = coerceTaggedRecords(payload.records);
  const applied: TaggedRecordType[] = [];
  for (const remote of incoming) {
    const local = await readAnyRecord(tx, remote.type, remote.record.id);
    const { localNeedsUpdate } = mergeOne(local ?? undefined, remote);
    if (localNeedsUpdate) {
      await writeRawRecord(tx, remote);
      applied.push(remote);
    }
  }
  return applied;
}

const handlers: { [K in CommandOp]: Handler<K> } = {
  "task.create": async (tx, payload, ctx) => {
    const now = ctx.now();
    const task: Task = {
      id: uuidv7(now),
      title: payload.title,
      notes: payload.notes ?? "",
      status: payload.status ?? "inbox",
      priority: payload.priority ?? 0,
      deferUntil: payload.deferUntil ?? null,
      dueAt: payload.dueAt ?? null,
      completedAt: null,
      lastCompletedAt: null,
      projectId: payload.projectId ?? null,
      sectionId: payload.sectionId ?? null,
      contextIds: payload.contextIds ?? [],
      waitingFor: payload.waitingFor ?? null,
      starred: payload.starred ?? false,
      recurrence: payload.recurrence ?? null,
      checklist: payload.checklist ?? [],
      tags: payload.tags ?? [],
      orderKey: padOrderKey(now),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: null,
    };
    await tx.run(SQL_INSERT_TASK, taskToParams(task));
    return [tagTask(task)];
  },

  "task.update": async (tx, payload, ctx) => {
    const existing = await getTaskRow(tx, payload.id);
    if (!existing) throw new Error(`task not found: ${payload.id}`);
    const patch = payload.patch;
    const task: Task = {
      ...existing,
      title: patch.title ?? existing.title,
      notes: patch.notes ?? existing.notes,
      priority: patch.priority ?? existing.priority,
      deferUntil: patch.deferUntil !== undefined ? patch.deferUntil : existing.deferUntil,
      dueAt: patch.dueAt !== undefined ? patch.dueAt : existing.dueAt,
      projectId: patch.projectId !== undefined ? patch.projectId : existing.projectId,
      sectionId: patch.sectionId !== undefined ? patch.sectionId : existing.sectionId,
      contextIds: patch.contextIds ?? existing.contextIds,
      waitingFor: patch.waitingFor !== undefined ? patch.waitingFor : existing.waitingFor,
      starred: patch.starred ?? existing.starred,
      checklist: (patch.checklist as ChecklistItem[] | undefined) ?? existing.checklist,
      tags: patch.tags ?? existing.tags,
      recurrence:
        patch.recurrence !== undefined ? (patch.recurrence as RecurrenceRule | null) : existing.recurrence,
      updatedAt: ctx.now(),
      revision: existing.revision + 1,
    };
    await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
    return [tagTask(task)];
  },

  "task.moveStatus": async (tx, payload, ctx) => {
    const existing = await getTaskRow(tx, payload.id);
    if (!existing) throw new Error(`task not found: ${payload.id}`);
    const task: Task = {
      ...existing,
      status: payload.status,
      updatedAt: ctx.now(),
      revision: existing.revision + 1,
    };
    await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
    return [tagTask(task)];
  },

  "task.reorder": async (tx, payload, ctx) => {
    const now = ctx.now();
    const updated: TaggedRecord[] = [];
    for (let i = 0; i < payload.idsInOrder.length; i++) {
      const id = payload.idsInOrder[i] ?? "";
      const existing = await getTaskRow(tx, id);
      if (!existing) continue;
      const task: Task = {
        ...existing,
        orderKey: padOrderKey(i),
        updatedAt: now,
        revision: existing.revision + 1,
      };
      await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
      updated.push(tagTask(task));
    }
    return updated;
  },

  "task.complete": async (tx, payload, ctx) => {
    const existing = await getTaskRow(tx, payload.id);
    if (!existing) throw new Error(`task not found: ${payload.id}`);
    const now = ctx.now();
    let task: Task;
    const rule = existing.recurrence;
    if (rule) {
      // 剩余次数：本次完成即消耗一次，归零后任务结束
      const remaining =
        rule.remainingCount === null || rule.remainingCount === undefined
          ? null
          : rule.remainingCount - 1;
      const next =
        remaining !== null && remaining <= 0
          ? null
          : nextOccurrence(existing.dueAt ?? now, rule, now);
      if (next !== null) {
        // 重复任务：原记录推进到下一到期时间，保留完成痕迹
        task = {
          ...existing,
          dueAt: next,
          completedAt: null,
          lastCompletedAt: now,
          recurrence: remaining === null ? rule : { ...rule, remainingCount: remaining },
          updatedAt: now,
          revision: existing.revision + 1,
        };
      } else {
        task = {
          ...existing,
          status: "done",
          completedAt: now,
          lastCompletedAt: now,
          recurrence: remaining === null ? rule : { ...rule, remainingCount: 0 },
          updatedAt: now,
          revision: existing.revision + 1,
        };
      }
    } else {
      task = {
        ...existing,
        status: "done",
        completedAt: now,
        updatedAt: now,
        revision: existing.revision + 1,
      };
    }
    await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
    return [tagTask(task)];
  },

  "task.uncomplete": async (tx, payload, ctx) => {
    const existing = await getTaskRow(tx, payload.id);
    if (!existing) throw new Error(`task not found: ${payload.id}`);
    const task: Task = {
      ...existing,
      status: existing.projectId ? "next" : "inbox",
      completedAt: null,
      updatedAt: ctx.now(),
      revision: existing.revision + 1,
    };
    await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
    return [tagTask(task)];
  },

  "task.restore": async (tx, payload, ctx) => {
    // 墓碑记录也要能找回：直接按 id 查（含已删除行）
    const rows = await tx.query<SqliteRow>("SELECT * FROM tasks WHERE id = ?", [payload.id]);
    if (rows.length === 0) throw new Error(`task not found: ${payload.id}`);
    const existing = taskFromRow(rows[0] as SqliteRow);
    const task: Task = {
      ...existing,
      deletedAt: null,
      updatedAt: ctx.now(),
      revision: existing.revision + 1,
    };
    await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
    return [tagTask(task)];
  },

  "task.softDelete": async (tx, payload, ctx) => {
    const existing = await getTaskRow(tx, payload.id);
    if (!existing) throw new Error(`task not found: ${payload.id}`);
    const task: Task = {
      ...existing,
      deletedAt: ctx.now(),
      updatedAt: ctx.now(),
      revision: existing.revision + 1,
    };
    await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
    return [tagTask(task)];
  },

  "project.upsert": async (tx, payload, ctx) => {
    const now = ctx.now();
    let existing: Project | null = null;
    if (payload.id !== undefined) {
      const rows = await tx.query<SqliteRow>(
        "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
        [payload.id],
      );
      existing = rows.length > 0 ? projectFromRow(rows[0] as SqliteRow) : null;
    } else {
      existing = await findProjectByName(tx, payload.name);
    }
    const project: Project = existing
      ? {
          ...existing,
          name: payload.name,
          description: payload.description ?? existing.description,
          kind: payload.kind ?? existing.kind,
          status: payload.status ?? existing.status,
          color: payload.color !== undefined ? payload.color : existing.color,
          areaId: payload.areaId !== undefined ? payload.areaId : existing.areaId,
          reviewIntervalDays: payload.reviewIntervalDays ?? existing.reviewIntervalDays,
          updatedAt: now,
          revision: existing.revision + 1,
        }
      : {
          id: uuidv7(now),
          name: payload.name,
          description: payload.description ?? "",
          kind: payload.kind ?? "parallel",
          status: payload.status ?? "active",
          color: payload.color ?? null,
          areaId: payload.areaId ?? null,
          reviewIntervalDays: payload.reviewIntervalDays ?? 7,
          lastReviewedAt: null,
          createdAt: now,
          updatedAt: now,
          revision: 1,
          deletedAt: null,
        };
    if (existing) {
      await tx.run(
        "UPDATE projects SET name = ?, description = ?, kind = ?, status = ?, color = ?, area_id = ?, review_interval_days = ?, last_reviewed_at = ?, updated_at = ?, revision = ?, deleted_at = ? WHERE id = ?",
        [
          project.name,
          project.description,
          project.kind,
          project.status,
          project.color,
          project.areaId,
          project.reviewIntervalDays,
          project.lastReviewedAt,
          project.updatedAt,
          project.revision,
          project.deletedAt,
          project.id,
        ],
      );
    } else {
      await tx.run(
        "INSERT INTO projects (id, name, description, kind, status, color, area_id, review_interval_days, last_reviewed_at, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        projectToParams(project),
      );
    }
    return [{ type: "project", record: project }];
  },

  "project.markReviewed": async (tx, payload, ctx) => {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
      [payload.id],
    );
    if (rows.length === 0) throw new Error(`project not found: ${payload.id}`);
    const now = ctx.now();
    const project: Project = {
      ...projectFromRow(rows[0] as SqliteRow),
      lastReviewedAt: now,
      updatedAt: now,
      revision: (projectFromRow(rows[0] as SqliteRow).revision ?? 0) + 1,
    };
    await tx.run(
      "UPDATE projects SET last_reviewed_at = ?, updated_at = ?, revision = ? WHERE id = ?",
      [project.lastReviewedAt, project.updatedAt, project.revision, project.id],
    );
    return [{ type: "project", record: project }];
  },

  "project.softDelete": async (tx, payload, ctx) => {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
      [payload.id],
    );
    if (rows.length === 0) throw new Error(`project not found: ${payload.id}`);
    const now = ctx.now();
    const target: Project = {
      ...projectFromRow(rows[0] as SqliteRow),
      deletedAt: now,
      updatedAt: now,
      revision: 0,
    };
    target.revision = target.revision + 1;
    await tx.run(
      "UPDATE projects SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?",
      [target.deletedAt, target.updatedAt, target.revision, target.id],
    );
    return [{ type: "project", record: target }];
  },

  "context.upsert": async (tx, payload, ctx) => {
    const now = ctx.now();
    const name = payload.name.trim().replace(/^@+/, "").slice(0, 100);
    if (name.length === 0) throw new Error("context name is empty");
    const existing = await findContextByName(tx, name);
    const context: Context = existing
      ? {
          ...existing,
          color: payload.color !== undefined ? (payload.color ?? null) : existing.color,
          icon: payload.icon !== undefined ? (payload.icon ?? null) : existing.icon,
          updatedAt: now,
          revision: existing.revision + 1,
        }
      : {
          id: uuidv7(now),
          name,
          color: payload.color ?? null,
          icon: payload.icon ?? null,
          createdAt: now,
          updatedAt: now,
          revision: 1,
          deletedAt: null,
        };
    if (existing) {
      await tx.run(
        "UPDATE contexts SET color = ?, icon = ?, updated_at = ?, revision = ? WHERE id = ?",
        [context.color, context.icon, context.updatedAt, context.revision, context.id],
      );
    } else {
      await tx.run(
        "INSERT INTO contexts (id, name, color, icon, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        contextToParams(context),
      );
    }
    return [{ type: "context", record: context }];
  },

  "section.create": async (tx, payload, ctx) => {
    const now = ctx.now();
    const section: Section = {
      id: uuidv7(now),
      projectId: payload.projectId,
      name: payload.name,
      orderKey: padOrderKey(now),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: null,
    };
    await tx.run(
      "INSERT INTO sections (id, project_id, name, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      sectionToParams(section),
    );
    return [{ type: "section", record: section }];
  },

  "area.upsert": async (tx, payload, ctx) => {
    const now = ctx.now();
    let existing: Area | null = null;
    if (payload.id !== undefined) {
      const rows = await tx.query<SqliteRow>(
        "SELECT * FROM areas WHERE id = ? AND deleted_at IS NULL",
        [payload.id],
      );
      existing = rows.length > 0 ? areaFromRow(rows[0] as SqliteRow) : null;
    } else {
      const rows = await tx.query<SqliteRow>(
        "SELECT * FROM areas WHERE name = ? AND deleted_at IS NULL LIMIT 1",
        [payload.name],
      );
      existing = rows.length > 0 ? areaFromRow(rows[0] as SqliteRow) : null;
    }
    const area: Area = existing
      ? {
          ...existing,
          name: payload.name,
          color: payload.color !== undefined ? (payload.color ?? null) : existing.color,
          updatedAt: now,
          revision: existing.revision + 1,
        }
      : {
          id: uuidv7(now),
          name: payload.name,
          color: payload.color ?? null,
          orderKey: padOrderKey(now),
          createdAt: now,
          updatedAt: now,
          revision: 1,
          deletedAt: null,
        };
    if (existing) {
      await tx.run("UPDATE areas SET name = ?, color = ?, updated_at = ?, revision = ? WHERE id = ?", [
        area.name,
        area.color,
        area.updatedAt,
        area.revision,
        area.id,
      ]);
    } else {
      await tx.run(
        "INSERT INTO areas (id, name, color, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        areaToParams(area),
      );
    }
    return [{ type: "area", record: area }];
  },

  "area.softDelete": async (tx, payload, ctx) => {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM areas WHERE id = ? AND deleted_at IS NULL",
      [payload.id],
    );
    if (rows.length === 0) throw new Error(`area not found: ${payload.id}`);
    const now = ctx.now();
    const area: Area = {
      ...areaFromRow(rows[0] as SqliteRow),
      deletedAt: now,
      updatedAt: now,
      revision: areaFromRow(rows[0] as SqliteRow).revision + 1,
    };
    await tx.run("UPDATE areas SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?", [
      area.deletedAt,
      area.updatedAt,
      area.revision,
      area.id,
    ]);
    return [{ type: "area", record: area }];
  },

  "attachment.add": async (tx, payload, ctx) => {
    const now = ctx.now();
    const attachment: AttachmentMeta = {
      id: uuidv7(now),
      taskId: payload.taskId,
      fileName: payload.fileName,
      mimeType: payload.mimeType ?? "application/octet-stream",
      size: payload.size ?? 0,
      storagePath: payload.storagePath,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: null,
    };
    await tx.run(
      "INSERT INTO attachments (id, task_id, file_name, mime_type, size, storage_path, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      attachmentToParams(attachment),
    );
    return [{ type: "attachment", record: attachment }];
  },

  "attachment.remove": async (tx, payload, ctx) => {
    const rows = await tx.query<SqliteRow>(
      "SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL",
      [payload.id],
    );
    if (rows.length === 0) throw new Error(`attachment not found: ${payload.id}`);
    const now = ctx.now();
    const removed = {
      ...attachmentFromRow(rows[0] as SqliteRow),
      deletedAt: now,
      updatedAt: now,
      revision: 0,
    };
    removed.revision = removed.revision + 1;
    await tx.run(
      "UPDATE attachments SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?",
      [removed.deletedAt, removed.updatedAt, removed.revision, removed.id],
    );
    return [{ type: "attachment", record: removed }];
  },

  "settings.set": async (tx, payload) => {
    await tx.run(
      "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [payload.key, String(payload.value)],
    );
    return [];
  },

  "sync.applyRemote": async (tx, payload) => {
    return applyRemoteRecords(tx, payload);
  },

  "import.merge": async (tx, payload) => {
    return applyRemoteRecords(tx, payload);
  },
};

const SCHEMAS: { [K in CommandOp]: z.ZodType<CommandMap[K]> } = {
  "task.create": taskCreatePayloadSchema,
  "task.update": taskUpdatePayloadSchema,
  "task.moveStatus": taskMoveStatusPayloadSchema,
  "task.reorder": taskReorderPayloadSchema,
  "task.complete": taskCompletePayloadSchema,
  "task.uncomplete": taskCompletePayloadSchema,
  "task.softDelete": idOnlyPayloadSchema,
  "task.restore": idOnlyPayloadSchema,
  "project.upsert": projectUpsertPayloadSchema,
  "project.softDelete": idOnlyPayloadSchema,
  "project.markReviewed": idOnlyPayloadSchema,
  "context.upsert": contextUpsertPayloadSchema,
  "section.create": sectionCreatePayloadSchema,
  "area.upsert": areaUpsertPayloadSchema,
  "area.softDelete": idOnlyPayloadSchema,
  "attachment.add": attachmentAddPayloadSchema,
  "attachment.remove": idOnlyPayloadSchema,
  "settings.set": settingsSetPayloadSchema,
  "sync.applyRemote": recordsApplyPayloadSchema,
  "import.merge": recordsApplyPayloadSchema,
};

/**
 * 命令入口：schema 校验（失败即抛，IPC 层转译为可序列化错误）→
 * immediate 事务执行 handler → 组装 CommandResult。
 */
export async function executeCommand<K extends CommandOp>(
  executor: SqliteExecutor,
  op: K,
  payload: unknown,
  ctx: CommandContext,
): Promise<CommandResult> {
  const schema = SCHEMAS[op];
  if (!schema) throw new Error(`未注册的命令: ${op}`);
  const parsed = schema.parse(payload) as CommandMap[K];
  const records = await executor.transaction(
    (tx) => handlers[op](tx, parsed, ctx),
    "immediate",
  );
  return {
    ids: records.map((r) => r.record.id),
    records,
    serverTime: ctx.now(),
  };
}

export type { TaskStatusInput, AttachmentMeta };

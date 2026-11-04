import type {
  CommandMap,
  CommandOp,
  RecordsApplyPayload,
  TaggedRecord,
} from "../../models/commands";
import type { Task } from "../../models/task";
import type { SqliteExecutor, SqliteRow } from "../../platform/executor";
import { coerceTaggedRecords } from "../coerce";
import {
  areaFromRow,
  areaToParams,
  attachmentFromRow,
  attachmentToParams,
  contextFromRow,
  contextToParams,
  projectFromRow,
  projectToParams,
  sectionFromRow,
  sectionToParams,
  taskFromRow,
  taskToParams,
  templateFromRow,
  templateToParams,
} from "../mappers";
import { mergeOne } from "../../sync/merge";

/**
 * 命令层共享设施。
 *
 * 分层：
 * - 本文件只放与具体命令无关的上下文类型、handler 签名、行读取/原样写回与
 *   通用 SQL 字面量；
 * - 具体命令按领域拆到 task/project/section/contexts/areas/attachments/
 *   settings/sync，每个文件只依赖本文件与只读查询层；
 * - index.ts 负责组装显式注册表并唯一暴露 executeCommand。
 *
 * SQL 纪律：所有 SQL 都是文件内的单一静态字符串字面量 + 参数绑定，
 * 不接受变量拼接；动态排序/字段必须走白名单（当前命令层无动态列）。
 */

export interface CommandContext {
  /** 可注入时钟（测试确定性）；生产传 () => Date.now() */
  now: () => number;
}

export type Handler<K extends CommandOp> = (
  tx: SqliteExecutor,
  payload: CommandMap[K],
  ctx: CommandContext,
) => Promise<TaggedRecord[]>;

export function tagTask(task: Task): TaggedRecord {
  return { type: "task", record: task };
}

export function padOrderKey(n: number): string {
  return String(n).padStart(15, "0");
}

export async function getTaskRow(tx: SqliteExecutor, id: string): Promise<Task | null> {
  const rows = await tx.query<SqliteRow>(
    "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return rows.length > 0 ? taskFromRow(rows[0] as SqliteRow) : null;
}

export const SQL_INSERT_TASK =
  "INSERT INTO tasks (id, title, notes, status, priority, defer_until, due_at, completed_at, last_completed_at, project_id, section_id, context_ids, tags, waiting_for, starred, recurrence, checklist, order_key, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

export const SQL_UPDATE_TASK =
  "UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, defer_until = ?, due_at = ?, completed_at = ?, last_completed_at = ?, project_id = ?, section_id = ?, context_ids = ?, tags = ?, waiting_for = ?, starred = ?, recurrence = ?, checklist = ?, order_key = ?, updated_at = ?, revision = ?, deleted_at = ? WHERE id = ?";

export function taskUpdateParams(task: Task): unknown[] {
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
export async function readAnyRecord(
  tx: SqliteExecutor,
  type: TaggedRecord["type"],
  id: string,
): Promise<TaggedRecord | null> {
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
  } else if (type === "template") {
    rows = await tx.query<SqliteRow>("SELECT * FROM task_templates WHERE id = ?", [id]);
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
    case "template":
      return { type, record: templateFromRow(row) };
    case "attachment":
      return { type, record: attachmentFromRow(row) };
  }
}

/** 原样写入远端记录（保留其 revision/updatedAt/deletedAt——合并收敛依赖原值） */
export async function writeRawRecord(tx: SqliteExecutor, tagged: TaggedRecord): Promise<void> {
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
    case "template":
      await tx.run(
        "INSERT OR REPLACE INTO task_templates (id, name, title, notes, priority, project_id, context_ids, tags, checklist, recurrence, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        templateToParams(record as Parameters<typeof templateToParams>[0]),
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
export async function applyRemoteRecords(
  tx: SqliteExecutor,
  payload: RecordsApplyPayload,
): Promise<TaggedRecord[]> {
  const incoming = coerceTaggedRecords(payload.records);
  const applied: TaggedRecord[] = [];
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

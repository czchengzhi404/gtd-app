import type {
  CommandMap,
  CommandOp,
  FieldMergeEntry,
  FieldMergeSummary,
  RecordsApplyPayload,
  TaggedRecord,
} from "../../models/commands";
import type { Task } from "../../models/task";
import type { SqliteExecutor, SqliteRow } from "../../platform/executor";
import { coerceTaggedRecords } from "../coerce";
import { readRecordBase, upsertRecordBase } from "../record-base";
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
import { isTaskRecord, mergeTaskFields } from "../../sync/fieldmerge";
import { compareEntries, entryOf } from "../../sync/merge";

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

/**
 * handler 可选返回形状：除了受影响记录，还能携带与合并有关的汇总
 * （目前只有 sync.applyRemote / import.merge 会带 mergeSummary）。
 * 返回裸数组仍然合法——executeCommand 会归一化，既有 handler 无需改动。
 */
export interface HandlerOutcome {
  records: TaggedRecord[];
  mergeSummary?: FieldMergeSummary;
}

export type HandlerResult = TaggedRecord[] | HandlerOutcome;

export type Handler<K extends CommandOp> = (
  tx: SqliteExecutor,
  payload: CommandMap[K],
  ctx: CommandContext,
) => Promise<HandlerResult>;

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

/** applyRemoteRecords 的返回：写回记录 + 字段级合并汇总 */
export interface ApplyRemoteOutcome {
  applied: TaggedRecord[];
  mergeSummary: FieldMergeSummary;
}

/**
 * 应用一批远端/导入记录。逐条决策（顺序即优先级）：
 *
 * ① 本地没有该记录 → 整条应用，并更新基线；
 * ② 远端胜（revision 更高，或 revision 并列时 updatedAt 更新）→ 整条应用，
 *    并更新基线（此前行为不变，只是多记一份 base）；
 * ③ revision 并列且 updatedAt 不更新 → 不动（此前行为不变）；
 * ④ 本地 revision 更高：
 *    a. task + 两端都非墓碑 + 有基线 → **字段级 3-way**（mergeTaskFields）：
 *       合并结果与 local 不同时写回，revision = local.revision + 1、
 *       updatedAt = now，并更新基线；相同则只记录冲突字段名；
 *    b. task 但无基线 → 保持本地（整条 LWW），记入 noBaseConflicts；
 *    c. 非 task 类型，或任一端是墓碑 → 保持本地（整条 LWW），记入 unmergeable。
 *       墓碑不参与字段合并：把已删记录的字段搬进活记录，等于半复活。
 *
 * 返回实际写入本地的记录（含字段级合并写回的记录），以及字段级合并汇总。
 * 调用方（SyncService）按 200–500 条/批分块，每批 = 本命令 = 一个独立
 * immediate 事务；绝不与用户命令共享事务边界。
 */
export async function applyRemoteRecords(
  tx: SqliteExecutor,
  payload: RecordsApplyPayload,
  ctx: CommandContext,
): Promise<ApplyRemoteOutcome> {
  const incoming = coerceTaggedRecords(payload.records);
  const applied: TaggedRecord[] = [];
  const entries: FieldMergeEntry[] = [];
  const noBaseConflicts: string[] = [];
  const unmergeable: string[] = [];
  const staleRemotes: string[] = [];
  const mergedFieldNames = new Set<string>();
  const conflictFieldNames = new Set<string>();

  for (const remote of incoming) {
    const local = await readAnyRecord(tx, remote.type, remote.record.id);

    // ① 本地没有 → 整条应用
    if (local === null) {
      await writeRawRecord(tx, remote);
      await upsertRecordBase(tx, remote, ctx.now());
      applied.push(remote);
      continue;
    }

    // ② 远端胜 → 整条应用
    const cmp = compareEntries(entryOf(local), entryOf(remote), local.record.id, remote.record.id);
    if (cmp < 0) {
      await writeRawRecord(tx, remote);
      await upsertRecordBase(tx, remote, ctx.now());
      applied.push(remote);
      continue;
    }

    // ③ revision 并列 → 不动（并列的 updatedAt tiebreak 已在 ② 处理完毕）
    if (remote.record.revision === local.record.revision) continue;

    // ④ 本地 revision 更高：只有"任务 + 两端活 + 有基线"才做字段级合并
    if (
      !isTaskRecord(local) ||
      !isTaskRecord(remote) ||
      local.record.deletedAt !== null ||
      remote.record.deletedAt !== null
    ) {
      unmergeable.push(local.record.id);
      continue;
    }

    const base = await readRecordBase(tx, local.record.id);
    if (base === null) {
      noBaseConflicts.push(local.record.id);
      continue;
    }

    // 基线必须"严格早于"这份远端记录，它才是可用的共同祖先：
    // 若 base.revision >= remote.revision，说明对方还没拉到我们上一次推送，
    // 这份远端记录是陈旧副本——它与 base 的差异是我们早已消化过的旧值，
    // 合并回来只会把本地新值改回旧值（并制造 revision 抖动）。
    const baseRevision = typeof base.revision === "number" ? base.revision : 0;
    if (baseRevision >= remote.record.revision) {
      staleRemotes.push(local.record.id);
      continue;
    }

    const merged = mergeTaskFields(base, local.record, remote.record);
    if (merged.mergedFields.length > 0 || merged.conflictFields.length > 0) {
      entries.push({
        recordId: local.record.id,
        mergedFields: [...merged.mergedFields],
        conflictFields: [...merged.conflictFields],
      });
      for (const field of merged.mergedFields) mergedFieldNames.add(field);
      for (const field of merged.conflictFields) conflictFieldNames.add(field);
    }

    if (!merged.changed) continue;

    // 合并结果与 local 不同 → 写回并推进 revision（本地胜出，故 +1 覆盖远端）
    const next: Task = {
      ...merged.record,
      revision: local.record.revision + 1,
      updatedAt: ctx.now(),
    };
    const tagged: TaggedRecord = { type: "task", record: next };
    await writeRawRecord(tx, tagged);
    await upsertRecordBase(tx, tagged, ctx.now());
    applied.push(tagged);
  }

  return {
    applied,
    mergeSummary: {
      entries,
      mergedFields: [...mergedFieldNames].sort(),
      conflictFields: [...conflictFieldNames].sort(),
      noBaseConflicts,
      unmergeable,
      staleRemotes,
    },
  };
}

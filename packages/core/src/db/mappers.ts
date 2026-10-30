import type {
  Area,
  AttachmentMeta,
  ChecklistItem,
  Context,
  Project,
  RecurrenceRule,
  Section,
  Task,
  TaskStatus,
} from "../models/task";
import type { SqliteRow } from "../platform/executor";

/**
 * 行 ↔ 实体映射。contextIds / checklist / recurrence 以 JSON 文本存储——
 * 它们是记录内嵌数据，随记录整体参与同步合并（条目级粒度）。
 */

const TASK_STATUSES: readonly TaskStatus[] = ["inbox", "next", "waiting", "someday", "done"];

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strNullable(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean {
  return value === 1 || value === true;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function taskFromRow(row: SqliteRow): Task {
  const status = str(row.status) as TaskStatus;
  return {
    id: str(row.id),
    title: str(row.title),
    notes: str(row.notes),
    status: TASK_STATUSES.includes(status) ? status : "inbox",
    priority: (num(row.priority) ?? 0) as Task["priority"],
    deferUntil: num(row.defer_until),
    dueAt: num(row.due_at),
    completedAt: num(row.completed_at),
    lastCompletedAt: num(row.last_completed_at),
    projectId: strNullable(row.project_id),
    sectionId: strNullable(row.section_id),
    contextIds: parseJson<string[]>(row.context_ids, []),
    tags: parseJson<string[]>(row.tags, []),
    waitingFor: strNullable(row.waiting_for),
    starred: bool(row.starred),
    recurrence: parseJson<RecurrenceRule | null>(row.recurrence, null),
    checklist: parseJson<ChecklistItem[]>(row.checklist, []),
    orderKey: str(row.order_key),
    createdAt: num(row.created_at) ?? 0,
    updatedAt: num(row.updated_at) ?? 0,
    revision: num(row.revision) ?? 0,
    deletedAt: num(row.deleted_at),
  };
}

export function taskToParams(task: Task): unknown[] {
  return [
    task.id,
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
    task.createdAt,
    task.updatedAt,
    task.revision,
    task.deletedAt,
  ];
}

export function projectFromRow(row: SqliteRow): Project {
  return {
    id: str(row.id),
    name: str(row.name),
    description: str(row.description),
    kind: str(row.kind) === "sequential" ? "sequential" : "parallel",
    status: str(row.status) === "onHold" ? "onHold" : str(row.status) === "done" ? "done" : "active",
    color: strNullable(row.color),
    areaId: strNullable(row.area_id),
    reviewIntervalDays: num(row.review_interval_days) ?? 7,
    lastReviewedAt: num(row.last_reviewed_at),
    createdAt: num(row.created_at) ?? 0,
    updatedAt: num(row.updated_at) ?? 0,
    revision: num(row.revision) ?? 0,
    deletedAt: num(row.deleted_at),
  };
}

export function projectToParams(project: Project): unknown[] {
  return [
    project.id,
    project.name,
    project.description,
    project.kind,
    project.status,
    project.color,
    project.areaId,
    project.reviewIntervalDays,
    project.lastReviewedAt,
    project.createdAt,
    project.updatedAt,
    project.revision,
    project.deletedAt,
  ];
}

export function areaFromRow(row: SqliteRow): Area {
  return {
    id: str(row.id),
    name: str(row.name),
    color: strNullable(row.color),
    orderKey: str(row.order_key),
    createdAt: num(row.created_at) ?? 0,
    updatedAt: num(row.updated_at) ?? 0,
    revision: num(row.revision) ?? 0,
    deletedAt: num(row.deleted_at),
  };
}

export function areaToParams(area: Area): unknown[] {
  return [
    area.id,
    area.name,
    area.color,
    area.orderKey,
    area.createdAt,
    area.updatedAt,
    area.revision,
    area.deletedAt,
  ];
}

export function sectionFromRow(row: SqliteRow): Section {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    name: str(row.name),
    orderKey: str(row.order_key),
    createdAt: num(row.created_at) ?? 0,
    updatedAt: num(row.updated_at) ?? 0,
    revision: num(row.revision) ?? 0,
    deletedAt: num(row.deleted_at),
  };
}

export function sectionToParams(section: Section): unknown[] {
  return [
    section.id,
    section.projectId,
    section.name,
    section.orderKey,
    section.createdAt,
    section.updatedAt,
    section.revision,
    section.deletedAt,
  ];
}

export function contextFromRow(row: SqliteRow): Context {
  return {
    id: str(row.id),
    name: str(row.name),
    color: strNullable(row.color),
    icon: strNullable(row.icon),
    createdAt: num(row.created_at) ?? 0,
    updatedAt: num(row.updated_at) ?? 0,
    revision: num(row.revision) ?? 0,
    deletedAt: num(row.deleted_at),
  };
}

export function contextToParams(context: Context): unknown[] {
  return [
    context.id,
    context.name,
    context.color,
    context.icon,
    context.createdAt,
    context.updatedAt,
    context.revision,
    context.deletedAt,
  ];
}

export function attachmentFromRow(row: SqliteRow): AttachmentMeta {
  return {
    id: str(row.id),
    taskId: str(row.task_id),
    fileName: str(row.file_name),
    mimeType: str(row.mime_type),
    size: num(row.size) ?? 0,
    storagePath: str(row.storage_path),
    createdAt: num(row.created_at) ?? 0,
    updatedAt: num(row.updated_at) ?? 0,
    revision: num(row.revision) ?? 0,
    deletedAt: num(row.deleted_at),
  };
}

export function attachmentToParams(attachment: AttachmentMeta): unknown[] {
  return [
    attachment.id,
    attachment.taskId,
    attachment.fileName,
    attachment.mimeType,
    attachment.size,
    attachment.storagePath,
    attachment.createdAt,
    attachment.updatedAt,
    attachment.revision,
    attachment.deletedAt,
  ];
}

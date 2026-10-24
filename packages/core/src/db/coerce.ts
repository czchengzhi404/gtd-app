import type { TaggedRecord } from "../models/commands";
import type {
  AttachmentMeta,
  ChecklistItem,
  Context,
  Project,
  RecurrenceRule,
  Section,
  Task,
} from "../models/task";
import { TASK_STATUSES } from "../models/task";

/**
 * 远端/导入记录 → 实体的安全转换。同步文件与导入 JSON 都来自本应用自身，
 * 但仍按"不可信输入"处理：字段级类型检查 + 默认值，绝不透传。
 * revision/updatedAt/deletedAt 保留原值（合并收敛依赖原值，不由本地重发号）。
 */

const PRIORITIES = [0, 1, 2, 3] as const;

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown): boolean {
  return v === true || v === 1;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function baseFields(obj: Record<string, unknown>) {
  const now = Date.now();
  return {
    id: asString(obj.id),
    createdAt: asNumber(obj.createdAt) ?? now,
    updatedAt: asNumber(obj.updatedAt) ?? now,
    revision: Math.max(1, Math.trunc(asNumber(obj.revision) ?? 1)),
    deletedAt: asNumber(obj.deletedAt),
  };
}

export function coerceTask(obj: Record<string, unknown>): Task | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  const status = asString(obj.status, "inbox");
  const priority = asNumber(obj.priority) ?? 0;
  const recurrenceRaw = obj.recurrence;
  let recurrence: RecurrenceRule | null = null;
  if (recurrenceRaw !== null && typeof recurrenceRaw === "object") {
    const r = recurrenceRaw as Record<string, unknown>;
    const freq = asString(r.freq);
    if (freq === "daily" || freq === "weekly" || freq === "monthly" || freq === "yearly") {
      recurrence = {
        freq,
        interval: Math.max(1, Math.trunc(asNumber(r.interval) ?? 1)),
        byWeekday: asStringArray(r.byWeekday).length > 0
          ? asStringArray(r.byWeekday).map((x) => Number(x)).filter((n) => n >= 0 && n <= 6)
          : undefined,
        until: asNumber(r.until),
      };
    }
  }
  const checklist: ChecklistItem[] = Array.isArray(obj.checklist)
    ? obj.checklist
        .map((item): ChecklistItem | null => {
          if (item === null || typeof item !== "object") return null;
          const c = item as Record<string, unknown>;
          const id = asString(c.id);
          if (id.length === 0) return null;
          return {
            id,
            title: asString(c.title),
            done: asBool(c.done),
            orderKey: asString(c.orderKey),
          };
        })
        .filter((x): x is ChecklistItem => x !== null)
    : [];

  return {
    ...base,
    title: asString(obj.title).slice(0, 2000),
    notes: asString(obj.notes).slice(0, 100_000),
    status: (TASK_STATUSES as readonly string[]).includes(status)
      ? (status as Task["status"])
      : "inbox",
    priority: (PRIORITIES as readonly number[]).includes(priority)
      ? (priority as Task["priority"])
      : 0,
    dueAt: asNumber(obj.dueAt),
    completedAt: asNumber(obj.completedAt),
    lastCompletedAt: asNumber(obj.lastCompletedAt),
    projectId: asStringNull(obj.projectId),
    sectionId: asStringNull(obj.sectionId),
    contextIds: asStringArray(obj.contextIds),
    waitingFor: asStringNull(obj.waitingFor),
    starred: asBool(obj.starred),
    recurrence,
    checklist,
    orderKey: asString(obj.orderKey),
  };
}

export function coerceProject(obj: Record<string, unknown>): Project | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  const kind = asString(obj.kind, "parallel");
  const status = asString(obj.status, "active");
  return {
    ...base,
    name: asString(obj.name).slice(0, 500),
    description: asString(obj.description).slice(0, 20_000),
    kind: kind === "sequential" ? "sequential" : "parallel",
    status: status === "onHold" ? "onHold" : status === "done" ? "done" : "active",
    color: asStringNull(obj.color),
  };
}

export function coerceSection(obj: Record<string, unknown>): Section | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  return {
    ...base,
    projectId: asString(obj.projectId),
    name: asString(obj.name).slice(0, 500),
    orderKey: asString(obj.orderKey),
  };
}

export function coerceContext(obj: Record<string, unknown>): Context | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  return {
    ...base,
    name: asString(obj.name).slice(0, 100),
    color: asStringNull(obj.color),
    icon: asStringNull(obj.icon),
  };
}

export function coerceAttachment(obj: Record<string, unknown>): AttachmentMeta | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  return {
    ...base,
    taskId: asString(obj.taskId),
    fileName: asString(obj.fileName),
    mimeType: asString(obj.mimeType, "application/octet-stream"),
    size: asNumber(obj.size) ?? 0,
    storagePath: asString(obj.storagePath),
  };
}

const COERCERS: Record<TaggedRecord["type"], (obj: Record<string, unknown>) => unknown> = {
  task: coerceTask,
  project: coerceProject,
  section: coerceSection,
  context: coerceContext,
  attachment: coerceAttachment,
};

/** 逐条安全转换；非法条目丢弃（返回 null 项被过滤） */
export function coerceTaggedRecords(input: unknown): TaggedRecord[] {
  if (!Array.isArray(input)) return [];
  const result: TaggedRecord[] = [];
  for (const item of input) {
    if (item === null || typeof item !== "object") continue;
    const { type, record } = item as { type?: unknown; record?: unknown };
    if (
      (type !== "task" && type !== "project" && type !== "section" && type !== "context" && type !== "attachment") ||
      record === null ||
      typeof record !== "object"
    ) {
      continue;
    }
    const coerced = COERCERS[type](record as Record<string, unknown>);
    if (coerced !== null) {
      result.push({ type, record: coerced } as TaggedRecord);
    }
  }
  return result;
}

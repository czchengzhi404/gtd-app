import type { TaggedRecord } from "../models/commands";
import type {
  Area,
  AttachmentMeta,
  ChecklistItem,
  Context,
  Project,
  RecurrenceRule,
  Section,
  Task,
  TaskTemplate,
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

/**
 * 星期数组（0=周日 … 6=周六）：**数字**数组，不能用 asStringArray。
 *
 * 历史缺陷：coerceTask 曾误用 asStringArray，把 [1,3] 过滤成空数组，
 * 导致「每周一三」经一次同步或备份恢复就退化成「每周锚点日」，且无报错。
 * 任务与模板共用本函数，避免两处再次分叉。
 *
 * 同时兼容字符串数字（老版本/第三方导出写成 "1"），统一收敛为 number。
 */
function asWeekdayArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const days: number[] = [];
  for (const item of v) {
    const value = typeof item === "string" ? Number(item) : item;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) continue;
    if (!days.includes(value)) days.push(value);
  }
  return days;
}

/** 清单子项：id 缺失的条目丢弃（子项 id 是同步合并/实例化的身份键） */
function asChecklist(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return [];
  return v
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
    .filter((item): item is ChecklistItem => item !== null);
}

const RECURRENCE_FREQS: readonly RecurrenceRule["freq"][] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekdays",
  "afterCompletion",
];

/** 任务与模板共用的重复规则归一化（六种 freq + byWeekday/lastWeekday/remainingCount/until） */
function normalizeRecurrence(v: unknown): RecurrenceRule | null {
  if (v === null || v === undefined || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const freq = asString(r.freq) as RecurrenceRule["freq"];
  if (!RECURRENCE_FREQS.includes(freq)) return null;
  const rule: RecurrenceRule = {
    freq,
    interval: Math.max(1, Math.trunc(asNumber(r.interval) ?? 1)),
  };
  const byWeekday = asWeekdayArray(r.byWeekday);
  if (byWeekday.length > 0) rule.byWeekday = byWeekday;
  if (r.lastWeekday === true) rule.lastWeekday = true;
  const originAt = asNumber(r.originAt);
  if (originAt !== null) rule.originAt = originAt;
  // 显式 null 而非省略：缺字段等于「无限重复」，下游据此判断是否递减剩余次数
  const remaining = asNumber(r.remainingCount);
  rule.remainingCount =
    typeof r.remainingCount === "number" || remaining !== null
      ? Math.max(0, Math.trunc(remaining ?? 0))
      : null;
  rule.until = asNumber(r.until);
  return rule;
}

/**
 * 历史遗留的别名：模板路径曾单独实现一份（保留 lastWeekday / remainingCount）。
 * 现在统一走 normalizeRecurrence，避免任务与模板两套规则再次分叉。
 */
const asRecurrence = normalizeRecurrence;

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
  // 统一走 normalizeRecurrence：早期内联版本误用 asStringArray 过滤 byWeekday（数字数组），
  // 导致「每周一三」经同步/备份恢复后退化成每周一次。现在任务与模板共用同一实现。
  const recurrence = normalizeRecurrence(obj.recurrence);
  const checklist = asChecklist(obj.checklist);

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
    deferUntil: asNumber(obj.deferUntil),
    dueAt: asNumber(obj.dueAt),
    completedAt: asNumber(obj.completedAt),
    lastCompletedAt: asNumber(obj.lastCompletedAt),
    projectId: asStringNull(obj.projectId),
    sectionId: asStringNull(obj.sectionId),
    contextIds: asStringArray(obj.contextIds),
    tags: asStringArray(obj.tags),
    blockedBy: asStringArray(obj.blockedBy),
    waitingFor: asStringNull(obj.waitingFor),
    starred: asBool(obj.starred),
    recurrence,
    checklist,
    orderKey: asString(obj.orderKey),
  };
}

export function coerceTemplate(obj: Record<string, unknown>): TaskTemplate | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  const priority = asNumber(obj.priority) ?? 0;
  return {
    ...base,
    name: asString(obj.name).slice(0, 200),
    title: asString(obj.title).slice(0, 2000),
    notes: asString(obj.notes).slice(0, 100_000),
    priority: (PRIORITIES as readonly number[]).includes(priority)
      ? (priority as TaskTemplate["priority"])
      : 0,
    projectId: asStringNull(obj.projectId),
    contextIds: asStringArray(obj.contextIds),
    tags: asStringArray(obj.tags),
    checklist: asChecklist(obj.checklist),
    recurrence: asRecurrence(obj.recurrence),
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
    areaId: asStringNull(obj.areaId),
    reviewIntervalDays: Math.max(1, Math.trunc(asNumber(obj.reviewIntervalDays) ?? 7)),
    lastReviewedAt: asNumber(obj.lastReviewedAt),
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

export function coerceArea(obj: Record<string, unknown>): Area | null {
  const base = baseFields(obj);
  if (base.id.length === 0) return null;
  return {
    ...base,
    name: asString(obj.name).slice(0, 200),
    color: asStringNull(obj.color),
    orderKey: asString(obj.orderKey),
  };
}

const COERCERS: Record<TaggedRecord["type"], (obj: Record<string, unknown>) => unknown> = {
  task: coerceTask,
  project: coerceProject,
  section: coerceSection,
  context: coerceContext,
  area: coerceArea,
  attachment: coerceAttachment,
  template: coerceTemplate,
};

/** 逐条安全转换；非法条目丢弃（返回 null 项被过滤） */
export function coerceTaggedRecords(input: unknown): TaggedRecord[] {
  if (!Array.isArray(input)) return [];
  const result: TaggedRecord[] = [];
  for (const item of input) {
    if (item === null || typeof item !== "object") continue;
    const { type, record } = item as { type?: unknown; record?: unknown };
    if (
      (type !== "task" &&
        type !== "project" &&
        type !== "section" &&
        type !== "context" &&
        type !== "area" &&
        type !== "attachment" &&
        type !== "template") ||
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

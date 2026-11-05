import type { Task } from "../models/task";
import type { TaggedRecord } from "../models/commands";

/**
 * 任务字段级 3-way 合并（纯函数，无 IO、无 SQL、无时钟依赖）。
 *
 * 语义（定稿 v3 §字段级合并）：
 * - 只在 `local.revision > remote.revision`、两端都不是墓碑、且存在基线快照时启用；
 * - 逐字段比较 local / base / remote：
 *   ① 只有本地变 → 取本地；
 *   ② 只有远端变 → 取远端；
 *   ③ 两边都没变 → 取本地；
 *   ④ 两边都变且值不同 → 冲突，取本地（= revision 高的一侧），并记录字段名；
 * - 数组（contextIds / tags / checklist）与对象（recurrence）按**整值**比较，
 *   不做元素级合并（checklist 子项的元素级合并需要独立身份与删除语义，本版不做）；
 * - 元数据字段（id / createdAt / updatedAt / revision / deletedAt）不参与合并，
 *   由调用方决定 revision+1 / updatedAt=now。
 *
 * 墓碑不在本函数职责内：墓碑的"复活/覆盖"是整条 LWW 的事（见 sync/merge.ts
 * 注释——被更高 revision 的编辑击败即复活）。调用方必须先过滤掉任一端为墓碑
 * 的记录，否则会把已删记录的字段搬进活记录里。
 */

/**
 * 参与字段级合并的任务字段（白名单，顺序即冲突报告顺序）。
 * `id` / `createdAt` / `updatedAt` / `revision` / `deletedAt` 刻意不在其中。
 */
export const TASK_MERGE_FIELDS = [
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
] as const;

export type TaskMergeField = (typeof TASK_MERGE_FIELDS)[number];

const TASK_MERGE_FIELD_SET: ReadonlySet<string> = new Set(TASK_MERGE_FIELDS);

export function isTaskMergeField(field: string): field is TaskMergeField {
  return TASK_MERGE_FIELD_SET.has(field);
}

/**
 * 字段值相等判定：标量用 `===`，数组/对象按**结构**逐值比较。
 * 为什么不用 JSON.stringify：对象键顺序不同（例如 recurrence 由不同路径构造）
 * 会产生"伪变更"，把未改动的字段误判成冲突并制造 revision 抖动。
 */
export function sameFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => sameFieldValue(value, b[index]));
  }

  const aObject = a as Record<string, unknown>;
  const bObject = b as Record<string, unknown>;
  const aKeys = Object.keys(aObject);
  const bKeys = Object.keys(bObject);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bObject, key) &&
      sameFieldValue(aObject[key], bObject[key]),
  );
}

export interface TaskFieldMergeResult {
  /** 合并后的记录：字段值 = 合并结果，元数据（revision/updatedAt/…）沿用 local */
  record: Task;
  /** 采纳了远端值的字段（本地未变、远端变了） */
  mergedFields: TaskMergeField[];
  /** 双方都改且值不同、最终保留本地值的字段（真冲突） */
  conflictFields: TaskMergeField[];
  /** 合并结果是否与 local 不同（= mergedFields 非空） */
  changed: boolean;
}

/**
 * 3-way 合并任务字段。base 为基线快照的原始字段对象（`record_base.payload`
 * 解析结果）；缺失字段视为 undefined（保守判定为"本地变过"）。
 */
export function mergeTaskFields(
  base: Record<string, unknown>,
  local: Task,
  remote: Task,
): TaskFieldMergeResult {
  const mergedFields: TaskMergeField[] = [];
  const conflictFields: TaskMergeField[] = [];
  let record: Task = local;

  for (const field of TASK_MERGE_FIELDS) {
    const baseValue = base[field];
    const localValue = taskFieldValue(local, field);
    const remoteValue = taskFieldValue(remote, field);
    const localChanged = !sameFieldValue(localValue, baseValue);
    const remoteChanged = !sameFieldValue(remoteValue, baseValue);

    // ① 只有远端变 → 取远端
    if (remoteChanged && !localChanged) {
      record = withTaskField(record, field, remoteValue);
      mergedFields.push(field);
      continue;
    }
    // ④ 双方都变且值不同 → 冲突，保留本地（revision 更高）
    if (localChanged && remoteChanged && !sameFieldValue(localValue, remoteValue)) {
      conflictFields.push(field);
    }
    // ②③ 其余情况（只有本地变 / 都没变 / 双方改成同一个值）→ 保留本地
  }

  return { record, mergedFields, conflictFields, changed: mergedFields.length > 0 };
}

/** 按白名单字段名读值（字段名来自常量表，不来自外部输入） */
function taskFieldValue(record: Task, field: TaskMergeField): unknown {
  return (record as unknown as Record<string, unknown>)[field];
}

/** 按白名单字段名写值（返回新对象，不改入参） */
function withTaskField(record: Task, field: TaskMergeField, value: unknown): Task {
  return { ...(record as unknown as Record<string, unknown>), [field]: value } as unknown as Task;
}

/**
 * 记录类型守卫：`TaggedRecord` 的 type 与 record 不是判别联合，
 * 逐条合并需要显式窄化才能安全访问 Task 字段。
 */
export function isTaskRecord(tagged: TaggedRecord): tagged is { type: "task"; record: Task } {
  return tagged.type === "task";
}

/** 记录 → 冲突样本用的可读标签（任务用标题，其它用前 8 位 id） */
export function recordLabel(tagged: TaggedRecord): string {
  const record = tagged.record as { title?: unknown; name?: unknown; id?: unknown };
  if (typeof record.title === "string" && record.title.length > 0) return record.title;
  if (typeof record.name === "string" && record.name.length > 0) return record.name;
  return typeof record.id === "string" ? record.id.slice(0, 8) : "";
}

import { z } from "zod";
import type { AttachmentMeta, Context, Project, Section, Task } from "./task";

/**
 * 命令表 payload schema。
 *
 * 纪律：
 * 1. payload 必须是可结构化克隆的纯数据——禁止函数、类实例、循环引用；
 *    由 `src/__tests__/ipc-serializable.test.ts` 的 structuredClone 往返断言约束，
 *    这是 IPC（command(op, payload)）能工作的前提。
 * 2. 每个命令一个 schema；命令实现（db/commands/）在执行前用 schema 解析校验。
 */

const idSchema = z.string().min(1);
const timestampSchema = z.number().int().nonnegative();
const prioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const statusInputSchema = z.enum(["inbox", "next", "waiting", "someday"]);

export const taskCreatePayloadSchema = z.object({
  title: z.string().min(1).max(2000),
  notes: z.string().max(100_000).optional(),
  status: statusInputSchema.optional(),
  priority: prioritySchema.optional(),
  dueAt: timestampSchema.nullable().optional(),
  projectId: idSchema.nullable().optional(),
  sectionId: idSchema.nullable().optional(),
  contextIds: z.array(idSchema).optional(),
  waitingFor: z.string().max(500).nullable().optional(),
  starred: z.boolean().optional(),
  recurrence: z
    .object({
      freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
      interval: z.number().int().min(1).max(999),
      byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
      until: timestampSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
  checklist: z
    .array(
      z.object({
        id: idSchema,
        title: z.string().min(1).max(2000),
        done: z.boolean(),
        orderKey: z.string(),
      }),
    )
    .optional(),
});
export type TaskCreatePayload = z.infer<typeof taskCreatePayloadSchema>;

/** 字段级 patch：键为 Task 的可编辑字段，值走对应字段的宽松校验 */
export const taskUpdatePayloadSchema = z.object({
  id: idSchema,
  patch: z.object({
    title: z.string().min(1).max(2000).optional(),
    notes: z.string().max(100_000).optional(),
    priority: prioritySchema.optional(),
    dueAt: timestampSchema.nullable().optional(),
    projectId: idSchema.nullable().optional(),
    sectionId: idSchema.nullable().optional(),
    contextIds: z.array(idSchema).optional(),
    waitingFor: z.string().max(500).nullable().optional(),
    starred: z.boolean().optional(),
    recurrence: z
      .object({
        freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
        interval: z.number().int().min(1).max(999),
        byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
        until: timestampSchema.nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
});
export type TaskUpdatePayload = z.infer<typeof taskUpdatePayloadSchema>;

export const taskMoveStatusPayloadSchema = z.object({
  id: idSchema,
  status: statusInputSchema,
});
export type TaskMoveStatusPayload = z.infer<typeof taskMoveStatusPayloadSchema>;

export const taskReorderPayloadSchema = z.object({
  idsInOrder: z.array(idSchema).min(1),
});
export type TaskReorderPayload = z.infer<typeof taskReorderPayloadSchema>;

export const taskCompletePayloadSchema = z.object({ id: idSchema });
export type TaskCompletePayload = z.infer<typeof taskCompletePayloadSchema>;

export const idOnlyPayloadSchema = z.object({ id: idSchema });
export type IdOnlyPayload = z.infer<typeof idOnlyPayloadSchema>;

export const projectUpsertPayloadSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(20_000).optional(),
  kind: z.enum(["sequential", "parallel"]).optional(),
  status: z.enum(["active", "onHold", "done"]).optional(),
  color: z.string().max(32).nullable().optional(),
});
export type ProjectUpsertPayload = z.infer<typeof projectUpsertPayloadSchema>;

export const settingsSetPayloadSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type SettingsSetPayload = z.infer<typeof settingsSetPayloadSchema>;

/** 按名 find-or-create（@情境）；名称去除首尾空白与 @ 前缀后存储 */
export const contextUpsertPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(32).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
});
export type ContextUpsertPayload = z.infer<typeof contextUpsertPayloadSchema>;

export const sectionCreatePayloadSchema = z.object({
  projectId: idSchema,
  name: z.string().min(1).max(500),
});
export type SectionCreatePayload = z.infer<typeof sectionCreatePayloadSchema>;

/**
 * 远端/导入记录应用。records 经 coerceTaggedRecords 逐条安全转换后再合并
 * （revision 优先规则），本 schema 只做结构级校验。
 */
export const recordsApplyPayloadSchema = z.object({
  records: z.array(
    z.object({
      type: z.enum(["task", "project", "section", "context", "attachment"]),
      record: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type RecordsApplyPayload = z.infer<typeof recordsApplyPayloadSchema>;

/**
 * 命令名 → payload 类型映射。注册到 IPC 的 op 必须出现在这里，
 * 主进程据此 dispatch，杜绝未注册命令被调用。
 */
export interface CommandMap {
  "task.create": TaskCreatePayload;
  "task.update": TaskUpdatePayload;
  "task.moveStatus": TaskMoveStatusPayload;
  "task.reorder": TaskReorderPayload;
  "task.complete": TaskCompletePayload;
  "task.uncomplete": TaskCompletePayload;
  "task.softDelete": IdOnlyPayload;
  "project.upsert": ProjectUpsertPayload;
  "project.softDelete": IdOnlyPayload;
  "context.upsert": ContextUpsertPayload;
  "section.create": SectionCreatePayload;
  "settings.set": SettingsSetPayload;
  /** 同步：按批应用远端记录（每批一个独立 immediate 事务） */
  "sync.applyRemote": RecordsApplyPayload;
  /** 导入 JSON 全量 dump：与 sync.applyRemote 同一合并路径（墓碑安全） */
  "import.merge": RecordsApplyPayload;
}

export type CommandOp = keyof CommandMap;

export interface Command<K extends CommandOp = CommandOp> {
  op: K;
  payload: CommandMap[K];
}

/** 变更记录的类型标签，渲染进程据此合并进对应状态切片 */
export type RecordType = "task" | "project" | "section" | "context" | "attachment";

export interface TaggedRecord {
  type: RecordType;
  record: Task | Project | Section | Context | AttachmentMeta;
}

/** IPC/命令结果：返回受影响记录的完整快照（可克隆数据），渲染进程据此 reconcile */
export interface CommandResult {
  /** 受影响实体 id */
  ids: string[];
  /** 变更后的记录（含 type 标签），全部为可克隆纯数据 */
  records: TaggedRecord[];
  /** 命令执行时刻的时间戳，供渲染进程对齐时钟差 */
  serverTime: number;
}

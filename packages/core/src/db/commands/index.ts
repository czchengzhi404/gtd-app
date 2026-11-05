import type { ZodType } from "zod";
import { AppError, toAppError } from "../../models/errors";
import type { CommandMap, CommandOp, CommandResult } from "../../models/commands";
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
  templateUpsertPayloadSchema,
} from "../../models/commands";
import type { SqliteExecutor } from "../../platform/executor";
import { areaCommands } from "./areas";
import { attachmentCommands } from "./attachments";
import { contextCommands } from "./contexts";
import { projectCommands } from "./project";
import { sectionCommands } from "./section";
import { settingsCommands } from "./settings";
import { syncCommands } from "./sync";
import { taskCommands } from "./task";
import { templateCommands } from "./templates";
import type { CommandContext, Handler } from "./shared";

/**
 * 命令层入口与注册表。
 *
 * 分层职责：
 * - models/commands.ts：op → payload 的 zod schema（唯一契约来源）；
 * - commands/shared.ts：CommandContext / Handler 类型、行读取与通用 SQL；
 * - commands/<domain>.ts：只含该领域 handler，不互相调用；
 * - 本文件：把 op → { schema, handler } 组装成显式注册表，并唯一暴露
 *   executeCommand。没有 switch/if 链，新增 op 必须同时补 schema 与 handler，
 *   否则 CommandRegistry 的类型检查直接失败。
 *
 * 事务边界 = 命令边界：
 * 1. 先做 schema 校验（失败不进入事务，包装为 AppError(validation_failed)）；
 * 2. 再在 executor.transaction(..., "immediate") 中执行 handler；
 * 3. handler 内部不做与数据库无关的异步等待，保证桌面主进程同线程串行语义；
 * 4. 返回值固定为 { ids, records, serverTime }，records 为可结构化克隆快照；
 *    同步类命令额外可选带 mergeSummary（字段级合并汇总）。
 *
 * SQL 纪律：所有 SQL 都是单一静态字符串字面量 + 参数绑定，禁止拼接；
 * 动态排序/字段必须走白名单映射（当前命令层没有动态列）。
 */

export interface CommandDefinition<K extends CommandOp> {
  schema: ZodType<CommandMap[K]>;
  handler: Handler<K>;
}

/** 每个 CommandOp 都必须有 schema 与 handler —— 缺一个即编译失败 */
export type CommandRegistry = { [K in CommandOp]: CommandDefinition<K> };

export const COMMAND_REGISTRY: CommandRegistry = {
  "task.create": { schema: taskCreatePayloadSchema, handler: taskCommands["task.create"] },
  "task.update": { schema: taskUpdatePayloadSchema, handler: taskCommands["task.update"] },
  "task.moveStatus": {
    schema: taskMoveStatusPayloadSchema,
    handler: taskCommands["task.moveStatus"],
  },
  "task.reorder": { schema: taskReorderPayloadSchema, handler: taskCommands["task.reorder"] },
  "task.complete": { schema: taskCompletePayloadSchema, handler: taskCommands["task.complete"] },
  "task.uncomplete": {
    schema: taskCompletePayloadSchema,
    handler: taskCommands["task.uncomplete"],
  },
  "task.softDelete": { schema: idOnlyPayloadSchema, handler: taskCommands["task.softDelete"] },
  "task.restore": { schema: idOnlyPayloadSchema, handler: taskCommands["task.restore"] },
  "project.upsert": { schema: projectUpsertPayloadSchema, handler: projectCommands["project.upsert"] },
  "project.softDelete": {
    schema: idOnlyPayloadSchema,
    handler: projectCommands["project.softDelete"],
  },
  "project.markReviewed": {
    schema: idOnlyPayloadSchema,
    handler: projectCommands["project.markReviewed"],
  },
  "context.upsert": { schema: contextUpsertPayloadSchema, handler: contextCommands["context.upsert"] },
  "section.create": { schema: sectionCreatePayloadSchema, handler: sectionCommands["section.create"] },
  "area.upsert": { schema: areaUpsertPayloadSchema, handler: areaCommands["area.upsert"] },
  "area.softDelete": { schema: idOnlyPayloadSchema, handler: areaCommands["area.softDelete"] },
  "template.upsert": {
    schema: templateUpsertPayloadSchema,
    handler: templateCommands["template.upsert"],
  },
  "template.softDelete": {
    schema: idOnlyPayloadSchema,
    handler: templateCommands["template.softDelete"],
  },
  "template.instantiate": {
    schema: idOnlyPayloadSchema,
    handler: templateCommands["template.instantiate"],
  },
  "attachment.add": { schema: attachmentAddPayloadSchema, handler: attachmentCommands["attachment.add"] },
  "attachment.remove": {
    schema: idOnlyPayloadSchema,
    handler: attachmentCommands["attachment.remove"],
  },
  "settings.set": { schema: settingsSetPayloadSchema, handler: settingsCommands["settings.set"] },
  "sync.applyRemote": {
    schema: recordsApplyPayloadSchema,
    handler: syncCommands["sync.applyRemote"],
  },
  "import.merge": { schema: recordsApplyPayloadSchema, handler: syncCommands["import.merge"] },
};

/**
 * 命令入口：schema 校验（失败即抛 AppError，IPC 层转译为可序列化错误）→
 * immediate 事务执行 handler → 组装 CommandResult。
 */
export async function executeCommand<K extends CommandOp>(
  executor: SqliteExecutor,
  op: K,
  payload: unknown,
  ctx: CommandContext,
): Promise<CommandResult> {
  const definition = COMMAND_REGISTRY[op] as CommandDefinition<K> | undefined;
  if (!definition) {
    throw new AppError("validation_failed", `未注册的命令: ${op}`);
  }

  let parsed: CommandMap[K];
  try {
    parsed = definition.schema.parse(payload) as CommandMap[K];
  } catch (err) {
    throw toAppError(err);
  }

  try {
    const outcome = await executor.transaction(
      (tx) => definition.handler(tx, parsed, ctx),
      "immediate",
    );
    // handler 可返回裸记录数组（绝大多数命令）或 { records, mergeSummary }
    const records = Array.isArray(outcome) ? outcome : outcome.records;
    const mergeSummary = Array.isArray(outcome) ? undefined : outcome.mergeSummary;
    return {
      ids: records.map((record) => record.record.id),
      records,
      serverTime: ctx.now(),
      ...(mergeSummary === undefined ? {} : { mergeSummary }),
    };
  } catch (err) {
    throw toAppError(err);
  }
}

export type { CommandContext, Handler } from "./shared";
export type { TaskStatusInput, AttachmentMeta } from "../../models/task";

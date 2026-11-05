import type { TaggedRecord } from "../../models/commands";
import type { ChecklistItem, RecurrenceRule, Task } from "../../models/task";
import type { SqliteRow } from "../../platform/executor";
import { nextOccurrence } from "../../features/recurrence";
import { taskFromRow, taskToParams } from "../mappers";
import { pushNoteVersion } from "../note-versions";
import { uuidv7 } from "../ids";
import {
  getTaskRow,
  padOrderKey,
  SQL_INSERT_TASK,
  SQL_UPDATE_TASK,
  tagTask,
  taskUpdateParams,
  type Handler,
} from "./shared";

type TaskCommandOp =
  | "task.create"
  | "task.update"
  | "task.moveStatus"
  | "task.reorder"
  | "task.complete"
  | "task.uncomplete"
  | "task.softDelete"
  | "task.restore";

const createTask: Handler<"task.create"> = async (tx, payload, ctx) => {
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
};

const updateTask: Handler<"task.update"> = async (tx, payload, ctx) => {
  const existing = await getTaskRow(tx, payload.id);
  if (!existing) throw new Error(`task not found: ${payload.id}`);
  const patch = payload.patch;
  // 正文变更前先存旧版本：撤销栈只有 60 秒，覆盖不了"手滑全选删掉又保存"
  if (patch.notes !== undefined && patch.notes !== existing.notes) {
    await pushNoteVersion(tx, existing.id, existing.notes, ctx.now()).catch(() => null);
  }
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
      patch.recurrence !== undefined
        ? (patch.recurrence as RecurrenceRule | null)
        : existing.recurrence,
    updatedAt: ctx.now(),
    revision: existing.revision + 1,
  };
  await tx.run(SQL_UPDATE_TASK, taskUpdateParams(task));
  return [tagTask(task)];
};

const moveTaskStatus: Handler<"task.moveStatus"> = async (tx, payload, ctx) => {
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
};

const reorderTasks: Handler<"task.reorder"> = async (tx, payload, ctx) => {
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
};

const completeTask: Handler<"task.complete"> = async (tx, payload, ctx) => {
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
};

const uncompleteTask: Handler<"task.uncomplete"> = async (tx, payload, ctx) => {
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
};

const restoreTask: Handler<"task.restore"> = async (tx, payload, ctx) => {
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
};

const softDeleteTask: Handler<"task.softDelete"> = async (tx, payload, ctx) => {
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
};

export const taskCommands = {
  "task.create": createTask,
  "task.update": updateTask,
  "task.moveStatus": moveTaskStatus,
  "task.reorder": reorderTasks,
  "task.complete": completeTask,
  "task.uncomplete": uncompleteTask,
  "task.softDelete": softDeleteTask,
  "task.restore": restoreTask,
} satisfies { [K in TaskCommandOp]: Handler<K> };

import { AppError } from "../../models/errors";
import type { Task, TaskTemplate } from "../../models/task";
import { findTemplateByName, getTemplateById } from "../queries";
import { taskToParams, templateToParams } from "../mappers";
import { uuidv7 } from "../ids";
import { padOrderKey, SQL_INSERT_TASK, tagTask, type Handler } from "./shared";

/**
 * 任务模板命令。
 *
 * 语义：
 * - `template.upsert`：有 id 按 id 更新（revision+1）；无 id 时同名未删除模板
 *   视为同一条（find-or-create）。省略字段保留原值 / 创建时取默认值。
 * - `template.softDelete`：写墓碑并 revision+1（墓碑参与同步合并）。
 * - `template.instantiate`：在同一个 immediate 事务里按模板创建一条 inbox 任务；
 *   checklist 子项重新生成 id，避免多条任务共享子项 id；模板本身不变更，
 *   因此只返回新建的 task 记录（不为返回而提升模板 revision）。
 *
 * SQL 纪律：单一静态字符串字面量 + 参数绑定，列序与 templateToParams 一一对应。
 */

type TemplateCommandOp = "template.upsert" | "template.softDelete" | "template.instantiate";

const SQL_INSERT_TEMPLATE =
  "INSERT INTO task_templates (id, name, title, notes, priority, project_id, context_ids, tags, checklist, recurrence, created_at, updated_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

const SQL_UPDATE_TEMPLATE =
  "UPDATE task_templates SET name = ?, title = ?, notes = ?, priority = ?, project_id = ?, context_ids = ?, tags = ?, checklist = ?, recurrence = ?, updated_at = ?, revision = ?, deleted_at = ? WHERE id = ?";

/** 与 SQL_UPDATE_TEMPLATE 列序一一对应（显式数组，避免加列时错位） */
function templateUpdateParams(template: TaskTemplate): unknown[] {
  return [
    template.name,
    template.title,
    template.notes,
    template.priority,
    template.projectId,
    JSON.stringify(template.contextIds),
    JSON.stringify(template.tags),
    JSON.stringify(template.checklist),
    template.recurrence ? JSON.stringify(template.recurrence) : null,
    template.updatedAt,
    template.revision,
    template.deletedAt,
    template.id,
  ];
}

const upsertTemplate: Handler<"template.upsert"> = async (tx, payload, ctx) => {
  const now = ctx.now();
  const existing =
    payload.id !== undefined
      ? await getTemplateById(tx, payload.id)
      : await findTemplateByName(tx, payload.name);
  const template: TaskTemplate = existing
    ? {
        ...existing,
        name: payload.name,
        title: payload.title,
        notes: payload.notes ?? existing.notes,
        priority: payload.priority ?? existing.priority,
        projectId: payload.projectId !== undefined ? payload.projectId : existing.projectId,
        contextIds: payload.contextIds ?? existing.contextIds,
        tags: payload.tags ?? existing.tags,
        checklist: payload.checklist ?? existing.checklist,
        recurrence: payload.recurrence !== undefined ? payload.recurrence : existing.recurrence,
        updatedAt: now,
        revision: existing.revision + 1,
      }
    : {
        id: uuidv7(now),
        name: payload.name,
        title: payload.title,
        notes: payload.notes ?? "",
        priority: payload.priority ?? 0,
        projectId: payload.projectId ?? null,
        contextIds: payload.contextIds ?? [],
        tags: payload.tags ?? [],
        checklist: payload.checklist ?? [],
        recurrence: payload.recurrence ?? null,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        deletedAt: null,
      };
  if (existing) {
    await tx.run(SQL_UPDATE_TEMPLATE, templateUpdateParams(template));
  } else {
    await tx.run(SQL_INSERT_TEMPLATE, templateToParams(template));
  }
  return [{ type: "template", record: template }];
};

const softDeleteTemplate: Handler<"template.softDelete"> = async (tx, payload, ctx) => {
  const existing = await getTemplateById(tx, payload.id);
  if (!existing) throw new AppError("not_found", `template not found: ${payload.id}`);
  const now = ctx.now();
  const target: TaskTemplate = {
    ...existing,
    deletedAt: now,
    updatedAt: now,
    revision: existing.revision + 1,
  };
  // 只写墓碑相关列：其余字段原样保留（避免整行重写的竞态与无谓 IO）
  await tx.run(
    "UPDATE task_templates SET deleted_at = ?, updated_at = ?, revision = ? WHERE id = ?",
    [target.deletedAt, target.updatedAt, target.revision, target.id],
  );
  return [{ type: "template", record: target }];
};

const instantiateTemplate: Handler<"template.instantiate"> = async (tx, payload, ctx) => {
  const template = await getTemplateById(tx, payload.id);
  if (!template) throw new AppError("not_found", `template not found: ${payload.id}`);
  const now = ctx.now();
  const rule = template.recurrence;
  const task: Task = {
    id: uuidv7(now),
    title: template.title,
    notes: template.notes,
    // 模板只提供骨架：状态/日期/完成痕迹由实例化的使用场景决定
    status: "inbox",
    priority: template.priority,
    deferUntil: null,
    dueAt: null,
    completedAt: null,
    lastCompletedAt: null,
    projectId: template.projectId,
    sectionId: null,
    contextIds: [...template.contextIds],
    tags: [...template.tags],
    waitingFor: null,
    starred: false,
    recurrence:
      rule === null
        ? null
        : { ...rule, byWeekday: rule.byWeekday ? [...rule.byWeekday] : undefined },
    // 子项 id 必须重新生成：模板子项 id 只属于模板，不能与任务共享
    checklist: template.checklist.map((item) => ({ ...item, id: uuidv7(now) })),
    orderKey: padOrderKey(now),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
  };
  await tx.run(SQL_INSERT_TASK, taskToParams(task));
  // 模板未变更：只返回新建任务，模板 revision 保持不变
  return [tagTask(task)];
};

export const templateCommands = {
  "template.upsert": upsertTemplate,
  "template.softDelete": softDeleteTemplate,
  "template.instantiate": instantiateTemplate,
} satisfies { [K in TemplateCommandOp]: Handler<K> };

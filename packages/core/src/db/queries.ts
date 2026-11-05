import type {
  Area,
  AttachmentMeta,
  Context,
  Project,
  Section,
  Task,
  TaskTemplate,
} from "../models/task";
import {
  areaFromRow,
  attachmentFromRow,
  contextFromRow,
  projectFromRow,
  sectionFromRow,
  taskFromRow,
  templateFromRow,
} from "./mappers";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";

/**
 * 只读查询层。纪律：
 * - SQL 一律为调用点内联的单一静态字符串字面量 + 参数绑定，零字符串组装
 *   （静态条件拼接也不用）；行级过滤在 JS 侧完成——本地优先应用的个人量级
 *   数据（千级记录）下全表扫描开销可忽略，换来零注入面。
 * - 排序键固定（order_key / created_at），不引入动态列名。
 * - 所有查询默认排除墓碑（deleted_at IS NULL）。
 */

export interface TaskFilter {
  status?: Task["status"];
  projectId?: string;
  starred?: boolean;
  /** dueAt <= untilAt（毫秒）且未完成，用于"今天"视图 */
  dueBefore?: number;
  includeDone?: boolean;
}

function matchesTaskFilter(task: Task, filter: TaskFilter): boolean {
  if (filter.status !== undefined && task.status !== filter.status) return false;
  if (filter.projectId !== undefined && task.projectId !== filter.projectId) return false;
  if (filter.starred !== undefined && task.starred !== filter.starred) return false;
  if (filter.dueBefore !== undefined && (task.dueAt === null || task.dueAt > filter.dueBefore)) {
    return false;
  }
  if (!filter.includeDone && task.status === "done") return false;
  return true;
}

export async function getTasks(executor: SqliteExecutor, filter: TaskFilter = {}): Promise<Task[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY order_key ASC, created_at ASC",
  );
  const tasks = rows.map(taskFromRow);
  const noFilter =
    filter.status === undefined &&
    filter.projectId === undefined &&
    filter.starred === undefined &&
    filter.dueBefore === undefined &&
    filter.includeDone === true;
  return noFilter ? tasks : tasks.filter((task) => matchesTaskFilter(task, filter));
}

export async function getTasksByIds(executor: SqliteExecutor, ids: string[]): Promise<Task[]> {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY order_key ASC, created_at ASC",
  );
  return rows.map(taskFromRow).filter((task) => wanted.has(task.id));
}

export async function getTaskById(executor: SqliteExecutor, id: string): Promise<Task | null> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return rows.length > 0 ? taskFromRow(rows[0] as SqliteRow) : null;
}

/** 回收站：只取墓碑（软删除未清理的），按删除时间倒序；上限 200 条防列表失控 */
export async function getDeletedTasks(executor: SqliteExecutor): Promise<Task[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200",
  );
  return rows.map(taskFromRow);
}

export async function getProjects(
  executor: SqliteExecutor,
  includeOnHold = true,
): Promise<Project[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at ASC",
  );
  const projects = rows.map(projectFromRow);
  return includeOnHold ? projects : projects.filter((p) => p.status === "active");
}

export async function getProjectById(
  executor: SqliteExecutor,
  id: string,
): Promise<Project | null> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return rows.length > 0 ? projectFromRow(rows[0] as SqliteRow) : null;
}

export async function findProjectByName(
  executor: SqliteExecutor,
  name: string,
): Promise<Project | null> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM projects WHERE name = ? AND deleted_at IS NULL LIMIT 1",
    [name],
  );
  return rows.length > 0 ? projectFromRow(rows[0] as SqliteRow) : null;
}

export async function getSections(
  executor: SqliteExecutor,
  projectId?: string,
): Promise<Section[]> {
  if (projectId === undefined) {
    const rows = await executor.query<SqliteRow>(
      "SELECT * FROM sections WHERE deleted_at IS NULL ORDER BY order_key ASC, created_at ASC",
    );
    return rows.map(sectionFromRow);
  }
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM sections WHERE project_id = ? AND deleted_at IS NULL ORDER BY order_key ASC, created_at ASC",
    [projectId],
  );
  return rows.map(sectionFromRow);
}

export async function getAreas(executor: SqliteExecutor): Promise<Area[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM areas WHERE deleted_at IS NULL ORDER BY order_key ASC, created_at ASC",
  );
  return rows.map(areaFromRow);
}

export async function getContexts(executor: SqliteExecutor): Promise<Context[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM contexts WHERE deleted_at IS NULL ORDER BY created_at ASC",
  );
  return rows.map(contextFromRow);
}

export async function findContextByName(
  executor: SqliteExecutor,
  name: string,
): Promise<Context | null> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM contexts WHERE name = ? AND deleted_at IS NULL LIMIT 1",
    [name],
  );
  return rows.length > 0 ? contextFromRow(rows[0] as SqliteRow) : null;
}

/**
 * 任务模板列表。默认排除墓碑；`includeDeleted = true` 用于同步收集
 * （墓碑必须参与合并，删除才能传播）。
 */
export async function getTemplates(
  executor: SqliteExecutor,
  includeDeleted = false,
): Promise<TaskTemplate[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM task_templates ORDER BY created_at ASC",
  );
  const templates = rows.map(templateFromRow);
  return includeDeleted ? templates : templates.filter((template) => template.deletedAt === null);
}

export async function getTemplateById(
  executor: SqliteExecutor,
  id: string,
): Promise<TaskTemplate | null> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM task_templates WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return rows.length > 0 ? templateFromRow(rows[0] as SqliteRow) : null;
}

export async function findTemplateByName(
  executor: SqliteExecutor,
  name: string,
): Promise<TaskTemplate | null> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM task_templates WHERE name = ? AND deleted_at IS NULL LIMIT 1",
    [name],
  );
  return rows.length > 0 ? templateFromRow(rows[0] as SqliteRow) : null;
}

/**
 * 全部未删除的附件（一次全表查）。
 *
 * 为什么需要：同步的 `collectLocalRecords` 原先按任务逐个查附件，形成 N+1——
 * 800 个任务就是 800 次查询。内存 SQLite 上只有 3ms，但在手机上每次 query 都要
 * 跨 JS↔原生桥，800 次往返能到几百毫秒甚至秒级。一次全表查把往返压到 1 次。
 */
export async function getAllActiveAttachments(
  executor: SqliteExecutor,
): Promise<AttachmentMeta[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM attachments WHERE deleted_at IS NULL ORDER BY created_at ASC",
  );
  return rows.map(attachmentFromRow);
}

export async function getAttachmentsForTask(
  executor: SqliteExecutor,
  taskId: string,
): Promise<AttachmentMeta[]> {
  const rows = await executor.query<SqliteRow>(
    "SELECT * FROM attachments WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
    [taskId],
  );
  return rows.map(attachmentFromRow);
}

export interface KvEntry extends Record<string, unknown> {
  key: string;
  value: string;
}

export async function getKv(executor: SqliteExecutor): Promise<Record<string, string>> {
  const rows = await executor.query<KvEntry>("SELECT key, value FROM kv");
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function getKvValue(
  executor: SqliteExecutor,
  key: string,
): Promise<string | null> {
  const rows = await executor.query<KvEntry>("SELECT value FROM kv WHERE key = ?", [key]);
  return rows.length > 0 ? (rows[0]?.value ?? null) : null;
}

/** 启动全量加载（渲染进程 bootstrap） */
export interface BootstrapData {
  tasks: Task[];
  projects: Project[];
  sections: Section[];
  contexts: Context[];
  areas: Area[];
  templates: TaskTemplate[];
  kv: Record<string, string>;
}

export interface TaskPageOptions {
  /** 每页条数（默认 200） */
  limit?: number;
  /** 偏移（默认 0） */
  offset?: number;
  /** 排序：updated=最近改动优先（默认）；order=按手动排序键 */
  orderBy?: "updated" | "order";
}

export interface TaskPage {
  tasks: Task[];
  /** 是否还有下一页 */
  hasMore: boolean;
}

/**
 * 任务分页查询（数据库层分页）。
 *
 * 为什么默认不用：当前架构（同步合并、全文搜索、统计）都以"store 里是全量"为前提，
 * 贸然改成增量加载会让这些功能算出错误结果。分页是给**大库模式**准备的基础设施——
 * 当任务数超过几千条、启动时间成为问题时，可以按页把最近的任务先灌进 store，
 * 其余按需追加（配合 `hasMore` 做"加载更多"）。
 *
 * 现在的调用方：`loadBootstrapData` 的 `taskLimit` 选项（默认不启用）。
 */
export async function getTasksPage(
  executor: SqliteExecutor,
  options: TaskPageOptions = {},
): Promise<TaskPage> {
  const limit = Math.max(1, Math.min(2000, Math.trunc(options.limit ?? 200)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const orderBy = options.orderBy ?? "updated";
  const orderClause = orderBy === "order" ? "order_key ASC" : "updated_at DESC";

  // 多取一条用于判断 hasMore，避免额外的 COUNT 查询
  const rows = await executor.query<SqliteRow>(
    `SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
    [limit + 1, offset],
  );
  const hasMore = rows.length > limit;
  return { tasks: rows.slice(0, limit).map(taskFromRow), hasMore };
}

/** 任务总数（不含墓碑）——分页 UI 显示"共 N 条"用 */
export async function countTasks(executor: SqliteExecutor): Promise<number> {
  const rows = await executor.query<SqliteRow>(
    "SELECT COUNT(*) AS total FROM tasks WHERE deleted_at IS NULL",
  );
  const total = rows[0]?.["total"];
  return typeof total === "number" ? total : Number(total ?? 0);
}

export async function loadBootstrapData(
  executor: SqliteExecutor,
  options: { taskLimit?: number } = {},
): Promise<BootstrapData> {
  const taskLimit = options.taskLimit;
  const [tasks, projects, sections, contexts, areas, templates, kv] = await Promise.all([
    taskLimit === undefined
      ? getTasks(executor, { includeDone: true })
      : getTasksPage(executor, { limit: taskLimit, orderBy: "updated" }).then((page) => page.tasks),
    getProjects(executor),
    getSections(executor),
    getContexts(executor),
    getAreas(executor),
    getTemplates(executor),
    getKv(executor),
  ]);
  return { tasks, projects, sections, contexts, areas, templates, kv };
}

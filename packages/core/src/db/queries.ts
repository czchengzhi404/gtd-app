import type {
  Area,
  AttachmentMeta,
  Context,
  Project,
  Section,
  Task,
} from "../models/task";
import {
  areaFromRow,
  attachmentFromRow,
  contextFromRow,
  projectFromRow,
  sectionFromRow,
  taskFromRow,
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
  kv: Record<string, string>;
}

export async function loadBootstrapData(executor: SqliteExecutor): Promise<BootstrapData> {
  const [tasks, projects, sections, contexts, areas, kv] = await Promise.all([
    getTasks(executor, { includeDone: true }),
    getProjects(executor),
    getSections(executor),
    getContexts(executor),
    getAreas(executor),
    getKv(executor),
  ]);
  return { tasks, projects, sections, contexts, areas, kv };
}

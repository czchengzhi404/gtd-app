import type { SqliteExecutor } from "../platform/executor";

/**
 * Schema 迁移。每条迁移 = 静态 SQL 语句数组（全部字符串字面量，
 * 无任何拼接），在一个事务内按序执行，版本号记在 meta 表。
 * 事务模式用 deferred：迁移发生在启动时（独占窗口），无并发写竞争。
 * 版本号写入使用参数绑定。
 */

interface Migration {
  version: number;
  statements: readonly string[];
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'inbox',
        priority INTEGER NOT NULL DEFAULT 0,
        due_at INTEGER,
        completed_at INTEGER,
        last_completed_at INTEGER,
        project_id TEXT,
        section_id TEXT,
        context_ids TEXT NOT NULL DEFAULT '[]',
        waiting_for TEXT,
        starred INTEGER NOT NULL DEFAULT 0,
        recurrence TEXT,
        checklist TEXT NOT NULL DEFAULT '[]',
        order_key TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at)`,
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'parallel',
        status TEXT NOT NULL DEFAULT 'active',
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, deleted_at)`,
      `CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        order_key TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sections_project ON sections(project_id)`,
      `CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at INTEGER
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_contexts_name ON contexts(name) WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id)`,
      `CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sync_cursors (
        device_id TEXT PRIMARY KEY,
        acked_revision INTEGER NOT NULL DEFAULT 0,
        last_pull_at INTEGER NOT NULL DEFAULT 0
      )`,
    ],
  },
  {
    version: 2,
    statements: [
      // 开始日期（defer）：到点前任务不出现在可执行视图
      `ALTER TABLE tasks ADD COLUMN defer_until INTEGER`,
      // 项目回顾周期
      `ALTER TABLE projects ADD COLUMN review_interval_days INTEGER NOT NULL DEFAULT 7`,
      `ALTER TABLE projects ADD COLUMN last_reviewed_at INTEGER`,
    ],
  },
  {
    version: 3,
    statements: [
      // 标签（多维检索）：记录内嵌数组
      `ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
      // 区域：项目的上层归类
      `CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        order_key TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_areas_name ON areas(name)`,
      `ALTER TABLE projects ADD COLUMN area_id TEXT`,
    ],
  },
];

export async function migrate(executor: SqliteExecutor): Promise<number> {
  let current = 0;
  // 全新库尚无 meta 表：先建（与迁移 v1 内的语句一致，幂等），再读版本
  await executor.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const rows = await executor.query<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    ["schema_version"],
  );
  if (rows.length > 0) {
    current = Number(rows[0]?.value ?? "0") || 0;
  }
  let applied = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await executor.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.run(statement);
      }
      await tx.run(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ["schema_version", String(migration.version)],
      );
    }, "deferred");
    current = migration.version;
    applied++;
  }
  return applied;
}

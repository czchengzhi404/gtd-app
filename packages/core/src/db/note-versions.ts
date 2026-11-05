import type { SqliteExecutor } from "../platform/executor";
import { countWords } from "../features/word-count";
import { uuidv7 } from "./ids";

/**
 * 正文历史快照（`note_versions`）。
 *
 * 语义：**保存新内容前，先把旧内容存一份**。这样"手滑全选删掉又保存"也能回滚，
 * 而撤销栈只有 60 秒、覆盖不了这种情况。
 *
 * 约束：
 * - 每任务只保留最近 `NOTE_VERSION_LIMIT` 条（写入时顺手裁剪，避免无限增长）；
 * - 内容相同的重复保存不产生新版本（由调用方先比较，本模块也再兜一次）；
 * - 不参与同步：它是本机编辑历史，跨设备价值低且会放大同步体积。
 */

export const NOTE_VERSION_LIMIT = 20;

export interface NoteVersion {
  id: string;
  taskId: string;
  content: string;
  wordCount: number;
  createdAt: number;
}

interface NoteVersionRow extends Record<string, unknown> {
  id: string;
  task_id: string;
  content: string;
  word_count: number;
  created_at: number;
}

function fromRow(row: NoteVersionRow): NoteVersion {
  return {
    id: row.id,
    taskId: row.task_id,
    content: row.content,
    wordCount: Number(row.word_count),
    createdAt: Number(row.created_at),
  };
}

const SQL_INSERT = `INSERT INTO note_versions (id, task_id, content, word_count, created_at)
  VALUES (?, ?, ?, ?, ?)`;

const SQL_LIST = `SELECT id, task_id, content, word_count, created_at
  FROM note_versions WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`;

const SQL_TRIM = `DELETE FROM note_versions WHERE task_id = ? AND id NOT IN (
  SELECT id FROM note_versions WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
)`;

/**
 * 记录一个版本（通常在写入新正文之前调用，存的是**旧正文**）。
 * 空内容不记录（新建任务时的空正文没有回滚价值）。
 */
export async function pushNoteVersion(
  executor: SqliteExecutor,
  taskId: string,
  content: string,
  now: number,
): Promise<NoteVersion | null> {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;

  const existing = await listNoteVersions(executor, taskId, 1);
  if (existing[0]?.content === content) return null;

  const version: NoteVersion = {
    id: uuidv7(),
    taskId,
    content,
    wordCount: countWords(content),
    createdAt: now,
  };

  await executor.run(SQL_INSERT, [
    version.id,
    version.taskId,
    version.content,
    version.wordCount,
    version.createdAt,
  ]);
  await executor.run(SQL_TRIM, [taskId, taskId, NOTE_VERSION_LIMIT]);
  return version;
}

/** 列出某任务的版本（新 → 旧） */
export async function listNoteVersions(
  executor: SqliteExecutor,
  taskId: string,
  limit = NOTE_VERSION_LIMIT,
): Promise<NoteVersion[]> {
  const rows = await executor.query<NoteVersionRow>(SQL_LIST, [taskId, limit]);
  return rows.map(fromRow);
}

/** 删除某任务的全部历史（任务被物理清理时用；软删不清理，保留可恢复性） */
export async function clearNoteVersions(executor: SqliteExecutor, taskId: string): Promise<void> {
  await executor.run("DELETE FROM note_versions WHERE task_id = ?", [taskId]);
}

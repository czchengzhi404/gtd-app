import { Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import { getSqliteExecutor } from "@gtd/core";

/**
 * 移动端本地备份（桌面端的等价物）。
 *
 * 桌面端用 `VACUUM INTO` 生成快照；移动端没有文件系统直写权限，
 * 改为「先 checkpoint → 再复制数据库文件」：
 *
 * - **必须 checkpoint**：库开了 WAL，最新写入可能还在 `-wal` 里没落盘。
 *   只复制 `gtd.db` 会拿到旧数据。`PRAGMA wal_checkpoint(TRUNCATE)` 会把
 *   WAL 合并进主库并清空，之后复制主库文件才是完整的。
 * - 路径不硬编码：用 `PRAGMA database_list` 问 SQLite 自己要真实文件路径，
 *   避免依赖 expo-sqlite 的内部目录约定。
 * - 保留最近 `KEEP` 份，按文件名（含时间戳）排序淘汰最旧的。
 */

const KEEP = 7;
const BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;

export interface MobileBackupResult {
  ok: boolean;
  message: string;
  count?: number;
}

interface DatabaseListRow extends Record<string, unknown> {
  seq: number;
  name: string;
  file: string;
}

/**
 * 解析数据库文件的**绝对**路径。
 *
 * 坑：`PRAGMA database_list` 在 expo-sqlite 上返回的 `file` 可能是**相对路径**
 * （如 `gtd.db`），直接拿去做 copyAsync 会抛
 * `FileNotFoundException: No resource found`。
 *
 * 所以这里收集多个候选、逐个探测存在性：
 * 1. PRAGMA 报告绝对路径 → 直接用
 * 2. PRAGMA 报告相对路径 → 拼上文档目录
 * 3. expo-sqlite 的常见落盘位置（`SQLite/` 与 `databases/`）
 */
let lastTriedPaths: string[] = [];

async function resolveDbPath(): Promise<string | null> {
  const candidates: string[] = [];
  const docDir = Paths.document.uri.endsWith("/") ? Paths.document.uri : `${Paths.document.uri}/`;

  try {
    const rows = await getSqliteExecutor().query<DatabaseListRow>("PRAGMA database_list", []);
    const main = rows.find((row) => row.name === "main");
    const reported = (main?.file ?? "").trim();
    if (reported.length > 0) {
      if (reported.startsWith("/") || reported.startsWith("file:")) candidates.push(reported);
      else candidates.push(`${docDir}${reported}`);
    }
  } catch {
    /* 忽略：走下面的默认候选 */
  }

  candidates.push(`${docDir}SQLite/gtd.db`, `${docDir}databases/gtd.db`, `${docDir}gtd.db`);

  for (const candidate of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (info.exists) return candidate;
    } catch {
      /* 继续试下一个 */
    }
  }
  lastTriedPaths = candidates;
  return null;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

async function listBackups(): Promise<string[]> {
  await ensureDir();
  const names = await FileSystem.readDirectoryAsync(BACKUP_DIR);
  return names.filter((name) => name.endsWith(".db")).sort();
}

/** 立即备份一份；返回当前保留的份数 */
export async function mobileBackupNow(): Promise<MobileBackupResult> {
  await ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // VACUUM INTO 需要普通文件路径（不带 file://），由 SQLite 自己写文件
  const docPath = Paths.document.uri.replace(/^file:\/\//, "");
  const targetPath = `${docPath}backups/gtd-${stamp}.db`;

  try {
    // 首选：VACUUM INTO —— 由 SQLite 内部生成一致快照（含 WAL 未落盘部分），
    // 不需要知道源库文件路径，也不需要 FileSystem.copyAsync。
    await getSqliteExecutor().run(`VACUUM INTO '${targetPath}'`, []);
  } catch (vacuumError) {
    // 兜底：VACUUM INTO 不可用（旧 SQLite 或路径限制）时退回文件复制。
    // 注意先 checkpoint，否则 -wal 里的最新写入不会进主库。
    try {
      await getSqliteExecutor().run("PRAGMA wal_checkpoint(TRUNCATE)", []);
    } catch {
      /* 尽力而为 */
    }
    const dbPath = await resolveDbPath();
    if (dbPath === null) {
      return {
        ok: false,
        message: `VACUUM INTO 失败（${vacuumError instanceof Error ? vacuumError.message : String(vacuumError)}），且找不到数据库文件。试过：${lastTriedPaths.join(" | ")}`,
      };
    }
    try {
      await FileSystem.copyAsync({ from: dbPath, to: `${FileSystem.documentDirectory}backups/gtd-${stamp}.db` });
    } catch (err) {
      return {
        ok: false,
        message: `备份失败（源 ${dbPath}）：${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const names = await listBackups();
  const excess = names.length - KEEP;
  for (let i = 0; i < excess; i += 1) {
    await FileSystem.deleteAsync(`${BACKUP_DIR}${names[i]}`, { idempotent: true }).catch(() => undefined);
  }

  const remaining = await listBackups();
  return { ok: true, message: `已备份（共 ${remaining.length} 份）`, count: remaining.length };
}

/** 当前备份份数 */
export async function mobileBackupCount(): Promise<number> {
  try {
    return (await listBackups()).length;
  } catch {
    return 0;
  }
}

/**
 * 从最近一份备份恢复。
 *
 * 注意：数据库连接还开着，覆盖文件后**必须重启应用**才能生效。
 * 这里只负责把文件换回去，重启由调用方提示用户。
 */
export async function mobileRestoreLatest(): Promise<MobileBackupResult> {
  const names = await listBackups();
  const latest = names[names.length - 1];
  if (latest === undefined) {
    return { ok: false, message: "没有可用的备份" };
  }

  const dbPath = await resolveDbPath();
  if (dbPath === null) {
    return { ok: false, message: "找不到数据库文件路径" };
  }

  try {
    // 覆盖前先把当前库 checkpoint 一次，减少文件被占用导致的失败
    await getSqliteExecutor().run("PRAGMA wal_checkpoint(TRUNCATE)", []).catch(() => undefined);
    await FileSystem.copyAsync({ from: `${BACKUP_DIR}${latest}`, to: dbPath });
    // WAL/SHM 必须删掉，否则会和恢复后的主库不一致
    await FileSystem.deleteAsync(`${dbPath}-wal`, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(`${dbPath}-shm`, { idempotent: true }).catch(() => undefined);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  return { ok: true, message: "已恢复，请重启应用生效" };
}

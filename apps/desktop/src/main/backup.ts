import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getSqlite } from "./state";

/**
 * 本地备份：VACUUM INTO 一致性快照（无需停库），保留最近 BACKUP_KEEP 份；
 * 启动时先备份一次，之后每 6 小时自动备份。
 * 恢复语义：用最新快照覆盖 userData/gtd.db，由调用方随后重启应用。
 */

const BACKUP_KEEP = 7;

function backupDir(): string {
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listBackups(): string[] {
  try {
    return fs
      .readdirSync(backupDir())
      .filter((name) => name.endsWith(".db"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** 生成一份一致性快照，并只保留最近 BACKUP_KEEP 份 */
export async function createBackup(): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(backupDir(), `gtd-${stamp}.db`);
  await getSqlite()!.executor.run("VACUUM INTO ?", [target]);
  const files = listBackups();
  for (const stale of files.slice(BACKUP_KEEP)) {
    fs.rmSync(path.join(backupDir(), stale), { force: true });
  }
  return target;
}

/** 用最近一份备份覆盖当前库（调用方随后重启应用） */
export function restoreLatestBackup(): string | null {
  const latest = listBackups()[0];
  if (latest === undefined) return null;
  const source = path.join(backupDir(), latest);
  const target = path.join(app.getPath("userData"), "gtd.db");
  getSqlite()?.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(target + suffix, { force: true });
  }
  fs.copyFileSync(source, target);
  return latest;
}

export function startAutoBackup(): void {
  void createBackup().catch((err) => {
    console.warn("[backup] 首次备份失败:", err instanceof Error ? err.message : String(err));
  });
  setInterval(
    () => {
      void createBackup().catch(() => undefined);
    },
    6 * 60 * 60 * 1000,
  );
}

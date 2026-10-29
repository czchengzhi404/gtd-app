/**
 * 桌面端动作：手动同步、同步配置、导入导出、本地与云端备份。
 * 运行在 Electron 渲染进程（浏览器环境）——文件操作走 gtd() 桥或 fetch。
 */
import {
  getSyncConfig,
  getOrCreateDeviceId,
  getSqliteExecutor,
  getFilesPort,
  createProvider,
  createSyncApplyForRenderer,
  syncNow,
  runCommand,
  bootstrapStore,
  collectLocalRecords,
  chunkRecords,
  getKvValue,
} from "@gtd/core";
import type { SyncConfig } from "@gtd/core";
import { t } from "@gtd/ui";
import { gtd } from "./gtd-api";
import { isDesktop } from "./env";

/** 敏感字段加密（桌面端 safeStorage，OS 级加密） */
async function encryptSecret(plaintext: string): Promise<string> {
  if (!isDesktop()) return plaintext;
  return gtd().secret.encrypt(plaintext);
}

/** 敏感字段解密 */
export async function decryptSecret(ciphertext: string): Promise<string> {
  if (!isDesktop()) return ciphertext;
  return gtd().secret.decrypt(ciphertext);
}

export interface SyncOutcome {
  ok: boolean;
  message: string;
}

/* ---------------- 手动同步 ---------------- */

export async function runManualSync(): Promise<SyncOutcome> {
  const executor = getSqliteExecutor();
  const config = await getSyncConfig(executor);
  if (config === null || !config.enabled) {
    return { ok: false, message: t("sync.notEnabled") };
  }
  const deviceId = await getOrCreateDeviceId(executor);
  const provider = createProvider(config, getFilesPort() ?? undefined);
  const report = await syncNow({
    provider,
    executor,
    deviceId,
    apply: createSyncApplyForRenderer(),
  });
  await runCommand("settings.set", { key: "sync.last", value: String(report.finishedAt) });
  await bootstrapStore();
  return {
    ok: true,
    message: t("sync.report", {
      applied: report.applied,
      pushed: report.pushed,
      devices: report.devices + 1,
    }),
  };
}

/* ---------------- 同步配置 ---------------- */

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  let final = config;
  if (config.kind === "folder" && isDesktop()) {
    const root = await gtd().sync.setFolderRoot(config.endpoint);
    final = { ...config, endpoint: root };
  }
  const encrypted = { ...final };
  if (encrypted.password !== undefined && encrypted.password.length > 0) {
    encrypted.password = await encryptSecret(encrypted.password);
  }
  if (encrypted.secretAccessKey !== undefined && encrypted.secretAccessKey.length > 0) {
    encrypted.secretAccessKey = await encryptSecret(encrypted.secretAccessKey);
  }
  await runCommand("settings.set", { key: "sync.config", value: JSON.stringify(encrypted) });
}

export async function pickSyncFolder(): Promise<string | null> {
  if (!isDesktop()) return null;
  return gtd().dialog.open({ directory: true });
}

/* ---------------- 本地备份（VACUUM INTO 快照） ---------------- */

export interface BackupOutcome {
  ok: boolean;
  message: string;
}

export async function backupNow(): Promise<BackupOutcome> {
  if (!isDesktop()) return { ok: false, message: t("more.backupDesktopOnly") };
  const result = await gtd().backup.now();
  return result.ok
    ? { ok: true, message: t("more.backupDone", { count: result.count ?? 0 }) }
    : { ok: false, message: result.error ?? "failed" };
}

export async function backupCount(): Promise<number> {
  if (!isDesktop()) return 0;
  const info = await gtd().backup.list().catch(() => ({ count: 0, latest: null }));
  return info.count;
}

export async function restoreLatestBackup(): Promise<BackupOutcome> {
  if (!isDesktop()) return { ok: false, message: t("more.backupDesktopOnly") };
  const result = await gtd().backup.restore();
  return result.ok
    ? { ok: true, message: t("more.backupRestoring") }
    : { ok: false, message: result.error ?? "failed" };
}

/* ---------------- 连接测试 ---------------- */

export async function testSyncConnection(config: SyncConfig): Promise<SyncOutcome> {
  const executor = getSqliteExecutor();
  const provider = createProvider(config, getFilesPort() ?? undefined);
  const devices = await provider.listDevices();
  return { ok: true, message: `${devices.length + 1}` };
}

/* ---------------- JSON 导出导入 ---------------- */

export async function exportAllToFile(): Promise<string | null> {
  const target = await gtd().dialog.save({ defaultPath: "gtd-export.json" });
  if (target === null) return null;
  const records = await collectLocalRecords(getSqliteExecutor());
  await gtd().fs.writeFile(
    target,
    JSON.stringify({ app: "gtd", version: 1, exportedAt: Date.now(), records }, null, 2),
  );
  return target;
}

export async function importFromFile(): Promise<string> {
  const picked = await gtd().dialog.open();
  if (picked === null) return t("more.status.canceled");
  const raw = await gtd().fs.readFile(picked);
  if (raw === null) throw new Error(t("sync.readFailed"));
  const parsed = JSON.parse(raw) as { records?: unknown };
  const records = Array.isArray(parsed.records) ? parsed.records : [];
  const batches = chunkRecords(records, 300);
  for (const batch of batches) {
    await runCommand("import.merge", { records: batch }).catch(() => undefined);
  }
  await bootstrapStore();
  return t("sync.merged", { n: records.length });
}

/* ---------------- 云端备份（WebDAV/S3 通道上传 JSON 快照） ---------------- */

const BACKUP_PREFIX = "gtd-backup-";

function backupFileName(): string {
  return `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

function b64(str: string): string {
  // 浏览器环境无 Buffer，用 btoa
  return btoa(str);
}

async function generateBackupJSON(): Promise<string> {
  const records = await collectLocalRecords(getSqliteExecutor());
  return JSON.stringify({ app: "gtd", version: 1, exportedAt: Date.now(), records }, null, 2);
}

/** 上传 JSON 备份到已配置的云端存储 */
export async function backupToCloud(config: SyncConfig): Promise<SyncOutcome> {
  const content = await generateBackupJSON();
  const fileName = backupFileName();

  if (config.kind === "folder" && isDesktop()) {
    const root = config.endpoint.replace(/[\\/]+$/, "");
    const dir = `${root}/backups`;
    await gtd().sync.setFolderRoot(dir);
    await gtd().fs.writeFile(`${dir}/${fileName}`, content);
    return { ok: true, message: fileName };
  }

  if (config.kind === "webdav") {
    const base = config.endpoint.replace(/\/+$/, "");
    const auth = b64(`${config.username ?? ""}:${config.password ?? ""}`);
    // MKCOL 确保目录存在
    await fetch(`${base}/backups/`, { method: "MKCOL", headers: { Authorization: `Basic ${auth}` } }).catch(() => undefined);
    const res = await fetch(`${base}/backups/${fileName}`, {
      method: "PUT",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: content,
    });
    if (!res.ok && res.status !== 201) {
      return { ok: false, message: `HTTP ${res.status}` };
    }
    return { ok: true, message: fileName };
  }

  return { ok: false, message: t("more.backupDesktopOnly") };
}

/** 从云端下载备份 JSON */
export async function downloadCloudBackup(config: SyncConfig, fileName: string): Promise<string | null> {
  if (config.kind !== "webdav" || !isDesktop()) return null;
  const base = config.endpoint.replace(/\/+$/, "");
  const auth = b64(`${config.username ?? ""}:${config.password ?? ""}`);
  const res = await fetch(`${base}/backups/${fileName}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return res.ok ? res.text() : null;
}

/** 从云端备份恢复 */
export async function restoreFromCloudBackup(
  config: SyncConfig,
  fileName: string,
): Promise<SyncOutcome> {
  const raw = await downloadCloudBackup(config, fileName);
  if (raw === null) return { ok: false, message: t("sync.readFailed") };
  const parsed = JSON.parse(raw) as { records?: unknown };
  const records = Array.isArray(parsed.records) ? parsed.records : [];
  const batches = chunkRecords(records, 300);
  for (const batch of batches) {
    await runCommand("import.merge", { records: batch }).catch(() => undefined);
  }
  await bootstrapStore();
  return { ok: true, message: t("sync.merged", { n: records.length }) };
}

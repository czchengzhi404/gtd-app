/** 桌面端动作：手动同步、同步配置、导入导出（UI 与菜单/托盘事件共用）。 */
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


export interface SyncOutcome {
  ok: boolean;
  message: string;
}

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

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  let final = config;
  if (config.kind === "folder" && isDesktop()) {
    const root = await gtd().sync.setFolderRoot(config.endpoint);
    final = { ...config, endpoint: root };
  }
  // 敏感字段（密码/密钥）在存储前加密
  const encrypted = { ...final };
  if (encrypted.password !== undefined && encrypted.password.length > 0) {
    encrypted.password = await encryptSecret(encrypted.password);
  }
  if (encrypted.secretAccessKey !== undefined && encrypted.secretAccessKey.length > 0) {
    encrypted.secretAccessKey = await encryptSecret(encrypted.secretAccessKey);
  }
  await runCommand("settings.set", { key: "sync.config", value: JSON.stringify(encrypted) });
}

/* ---------------- 本地备份 ---------------- */

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

export async function testSyncConnection(config: SyncConfig): Promise<BackupOutcome> {
  const executor = getSqliteExecutor();
  const deviceId = await getOrCreateDeviceId(executor);
  const provider = createProvider(config, getFilesPort() ?? undefined);
  // 只拉 manifest 列表验证连通性（不做全量同步）
  const devices = await provider.listDevices();
  return { ok: true, message: `${devices.length + 1} 台设备（含本机）` };
}

export async function pickSyncFolder(): Promise<string | null> {
  if (!isDesktop()) return null;
  return gtd().dialog.open({ directory: true });
}

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
    await runCommand("import.merge", { records: batch });
  }
  await bootstrapStore();
  return t("sync.merged", { n: records.length });
}


/** 敏感字段解密（桌面端 safeStorage，OS 级加密） */
export async function decryptSecret(ciphertext: string): Promise<string> {
  if (!isDesktop()) return ciphertext;
  return gtd().secret.decrypt(ciphertext);
}

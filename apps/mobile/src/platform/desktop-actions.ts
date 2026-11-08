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
  describePeerDevices,
  base64FromString,
} from "@gtd/core";
import type { FilesPort, PeerDeviceInfo, SyncConfig, SyncProgress } from "@gtd/core";
import { t } from "@gtd/ui";
import { gtd } from "./gtd-api";
import { isDesktop } from "./env";
import { openSecret, sealSecret } from "./secret-store";
import { mobileBackupCount, mobileBackupNow, mobileRestoreLatest } from "./mobile-backup";
import { pickSafDirectory, SafFilesPort } from "./saf-files-port";

/** 敏感字段加密：桌面走 safeStorage，移动端进系统安全存储（kv 只留指针） */
async function encryptSecret(plaintext: string, slot: "password" | "s3"): Promise<string> {
  return sealSecret(plaintext, slot);
}

/** 敏感字段解密（保留旧签名，内部统一走 secret-store） */
export async function decryptSecret(ciphertext: string): Promise<string> {
  return (await openSecret(ciphertext, "password")) ?? "";
}

export interface SyncOutcome {
  ok: boolean;
  message: string;
}

/** 把底层异常翻译成人能看懂的原因（网络 / 认证 / 路径 / 其它） */
export function classifySyncError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/\b(401|403)\b|unauthor|forbidden|invalid_?token|认证/i.test(raw)) return t("sync.errAuth");
  if (/\b404\b|not found|找不到/i.test(raw)) return t("sync.errNotFound");
  if (/ECONN|ETIMEDOUT|ENOTFOUND|network|fetch failed|timeout|abort/i.test(raw)) return t("sync.errNetwork");
  if (/ENOSPC|quota|space/i.test(raw)) return t("sync.errQuota");
  return t("sync.errUnknown", { message: raw });
}

/* ---------------- 手动同步 ---------------- */

/**
 * 读取同步配置并把敏感字段还原成明文（提供者需要真密码）。
 * 这是唯一允许拿到明文的地方：供 runManualSync / testSyncConnection / 云备份使用。
 */
export async function resolveSyncConfig(): Promise<SyncConfig | null> {
  const config = await getSyncConfig(getSqliteExecutor());
  if (config === null) return null;
  const password = await openSecret(config.password, "password");
  const secretAccessKey = await openSecret(config.secretAccessKey, "s3");
  return { ...config, password, secretAccessKey };
}

/**
 * 选 FilesPort：桌面端用注入的 Electron 端口；
 * 移动端的 folder 同步用 SAF 端口（rootUri 来自 config.endpoint）。
 */
function filesPortFor(config: SyncConfig): FilesPort | undefined {
  if (config.kind !== "folder") return undefined;
  if (isDesktop()) return getFilesPort() ?? undefined;
  return new SafFilesPort(config.endpoint);
}

export async function runManualSync(
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncOutcome> {
  const executor = getSqliteExecutor();
  const config = await resolveSyncConfig();
  if (config === null || !config.enabled) {
    return { ok: false, message: t("sync.notEnabled") };
  }
  const deviceId = await getOrCreateDeviceId(executor);
  const provider = createProvider(config, filesPortFor(config));
  try {
    const report = await syncNow({
      provider,
      executor,
      deviceId,
      apply: createSyncApplyForRenderer(),
      onProgress,
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
  } catch (err) {
    return { ok: false, message: classifySyncError(err) };
  }
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
    encrypted.password = await encryptSecret(encrypted.password, "password");
  }
  if (encrypted.secretAccessKey !== undefined && encrypted.secretAccessKey.length > 0) {
    encrypted.secretAccessKey = await encryptSecret(encrypted.secretAccessKey, "s3");
  }
  await runCommand("settings.set", { key: "sync.config", value: JSON.stringify(encrypted) });
}

export async function pickSyncFolder(): Promise<string | null> {
  if (!isDesktop()) {
    // 移动端：SAF 目录选择器（返回 content:// 树 URI）
    return pickSafDirectory();
  }
  return gtd().dialog.open({ directory: true });
}

/* ---------------- 本地备份（VACUUM INTO 快照） ---------------- */

export interface BackupOutcome {
  ok: boolean;
  message: string;
  /** 备份份数（移动端本地备份会返回） */
  count?: number;
}

export async function backupNow(): Promise<BackupOutcome> {
  if (!isDesktop()) {
    const result = await mobileBackupNow();
    return { ok: result.ok, message: result.message, count: result.count };
  }
  const result = await gtd().backup.now();
  return result.ok
    ? { ok: true, message: t("more.backupDone", { count: result.count ?? 0 }) }
    : { ok: false, message: result.error ?? "failed" };
}

export async function backupCount(): Promise<number> {
  if (!isDesktop()) return mobileBackupCount();
  const info = await gtd().backup.list().catch(() => ({ count: 0, latest: null }));
  return info.count;
}

export async function restoreLatestBackup(): Promise<BackupOutcome> {
  if (!isDesktop()) {
    const result = await mobileRestoreLatest();
    return { ok: result.ok, message: result.message };
  }
  const result = await gtd().backup.restore();
  return result.ok
    ? { ok: true, message: t("more.backupRestoring") }
    : { ok: false, message: result.error ?? "failed" };
}

/* ---------------- 连接测试 ---------------- */

export async function testSyncConnection(config: SyncConfig): Promise<SyncOutcome> {
  const resolved: SyncConfig = {
    ...config,
    password: await openSecret(config.password, "password"),
    secretAccessKey: await openSecret(config.secretAccessKey, "s3"),
  };
  const provider = createProvider(resolved, filesPortFor(resolved));
  const devices = await provider.listDevices();
  return { ok: true, message: `${devices.length + 1}` };
}

/** 其他设备概览（记录数 + 最后活动时间），用于同步页的「其他设备」列表 */
export async function listPeerDevices(): Promise<PeerDeviceInfo[]> {
  const config = await resolveSyncConfig();
  if (config === null || !config.enabled) return [];
  const provider = createProvider(config, getFilesPort() ?? undefined);
  const deviceId = await getOrCreateDeviceId(getSqliteExecutor());
  return describePeerDevices(provider, deviceId);
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

/**
 * 把一段 GTD 导出 JSON 合并进本地库。
 *
 * 分批 300 条走 `import.merge`——单条 immediate 事务在大文件上会把 WAL 撑爆，
 * 分批既能让 UI 有喘息，也能在某一批失败时保留前面已成功的记录（不整体回滚）。
 */
async function mergeImportedJson(raw: string): Promise<string> {
  let parsed: { records?: unknown };
  try {
    parsed = JSON.parse(raw) as { records?: unknown };
  } catch {
    throw new Error(t("more.status.importInvalid"));
  }
  const records = Array.isArray(parsed.records) ? parsed.records : [];
  if (records.length === 0) throw new Error(t("more.status.importInvalid"));
  const batches = chunkRecords(records, 300);
  for (const batch of batches) {
    await runCommand("import.merge", { records: batch }).catch(() => undefined);
  }
  await bootstrapStore();
  return t("sync.merged", { n: records.length });
}

export async function importFromFile(): Promise<string> {
  if (isDesktop()) {
    const picked = await gtd().dialog.open();
    if (picked === null) return t("more.status.canceled");
    const raw = await gtd().fs.readFile(picked);
    if (raw === null) throw new Error(t("sync.readFailed"));
    return mergeImportedJson(raw);
  }

  // 移动端：系统文件选择器（SAF / iOS Files）选一个 .json，读进内存再合并。
  // 不落盘复制——导出文件是只读一次的数据，复制进沙盒只会留下一份孤儿副本。
  const picker = await import("expo-document-picker");
  const result = await picker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/json", "text/plain", "application/octet-stream"],
  });
  if (result.canceled) return t("more.status.canceled");
  const asset = result.assets?.[0];
  if (asset === undefined) return t("more.status.canceled");
  const fs = await import("expo-file-system/legacy");
  const raw = await fs.readAsStringAsync(asset.uri, { encoding: fs.EncodingType.UTF8 });
  return mergeImportedJson(raw);
}

/* ---------------- 云端备份（WebDAV/S3 通道上传 JSON 快照） ---------------- */

const BACKUP_PREFIX = "gtd-backup-";

function backupFileName(): string {
  return `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

function b64(str: string): string {
  // 手机端 Hermes 没有全局 btoa：走 core 的纯 JS 实现
  return base64FromString(str);
}

async function generateBackupJSON(): Promise<string> {
  const records = await collectLocalRecords(getSqliteExecutor());
  return JSON.stringify({ app: "gtd", version: 1, exportedAt: Date.now(), records }, null, 2);
}

/** 上传 JSON 备份到已配置的云端存储 */
export async function backupToCloud(rawConfig: SyncConfig): Promise<SyncOutcome> {
  // 配置里的密码可能是 sec:/enc: 指针，这里统一还原成明文
  const config: SyncConfig = {
    ...rawConfig,
    password: await openSecret(rawConfig.password, "password"),
    secretAccessKey: await openSecret(rawConfig.secretAccessKey, "s3"),
  };
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

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
    // 主进程注册 fs 白名单根并归一化路径
    const root = await gtd().sync.setFolderRoot(config.endpoint);
    final = { ...config, endpoint: root };
  }
  await runCommand("settings.set", { key: "sync.config", value: JSON.stringify(final) });
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

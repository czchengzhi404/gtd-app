import { getKvValue, getSqliteExecutor, runCommand } from "@gtd/core";

import { RELEASES_URL, REPO } from "./links";

/**
 * 检查更新（移动端的「自动更新」等价物）。
 *
 * 桌面端由 electron-updater 静默下载安装；移动端侧载 APK 没有这个能力，
 * 能做的等价物是：查 GitHub 最新 release → 比版本 → 有新版就把结果记进 kv，
 * 由「更多」页的横幅和关于页引导用户去下载页。
 *
 * 不自动下载：侧载应用装 APK 需要用户确认，静默安装会触发系统安全策略。
 */

/** kv 键：已知有新版时记下版本号与下载页 */
export const KV_UPDATE_LATEST = "update.latest";
export const KV_UPDATE_URL = "update.url";
export const KV_UPDATE_CHECKED_AT = "update.checkedAt";

/** 自动检测的节流间隔：一天一次足够，别每次冷启动都打 GitHub API */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateCheckResult {
  ok: boolean;
  /** 当前版本 */
  current: string;
  /** 远端最新版本（拿不到时为 null） */
  latest: string | null;
  hasUpdate: boolean;
  message: string;
  url: string;
}

/** 语义化版本比较：返回 >0 表示 a 比 b 新 */
function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((part) => Number(part) || 0);
  const pb = b.replace(/^v/, "").split(".").map((part) => Number(part) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = {
    ok: false,
    current: currentVersion,
    latest: null,
    hasUpdate: false,
    message: "",
    url: RELEASES_URL,
  };

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      return { ...base, message: `查询失败（HTTP ${response.status}）` };
    }
    const data = (await response.json()) as { tag_name?: string; html_url?: string };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    if (latest.length === 0) {
      return { ...base, message: "没拿到版本号" };
    }
    const hasUpdate = compareVersion(latest, currentVersion) > 0;
    return {
      ok: true,
      current: currentVersion,
      latest,
      hasUpdate,
      message: hasUpdate ? `有新版本 ${latest}` : "已是最新版本",
      url: data.html_url ?? RELEASES_URL,
    };
  } catch (err) {
    return { ...base, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 启动时的静默检测。
 *
 * 失败一律静默（离网、GitHub 抽风都不该打扰用户）；成功则把结果写进 kv，
 * UI 只读 kv，不去关心这次网络到底成没成。
 * 一天只查一次：`update.checkedAt` 是上次成功查询的时间。
 */
export async function autoCheckForUpdate(currentVersion: string): Promise<UpdateCheckResult | null> {
  const lastRaw = await getKvValue(getSqliteExecutor(), KV_UPDATE_CHECKED_AT).catch(() => null);
  const last = Number(lastRaw ?? 0);
  if (Number.isFinite(last) && last > 0 && Date.now() - last < AUTO_CHECK_INTERVAL_MS) {
    return null;
  }

  const result = await checkForUpdate(currentVersion);
  if (!result.ok) return null;

  await runCommand("settings.set", { key: KV_UPDATE_CHECKED_AT, value: Date.now() }).catch(
    () => undefined,
  );
  if (result.hasUpdate && result.latest !== null) {
    await runCommand("settings.set", { key: KV_UPDATE_LATEST, value: result.latest }).catch(
      () => undefined,
    );
    await runCommand("settings.set", { key: KV_UPDATE_URL, value: result.url }).catch(() => undefined);
  } else {
    // 已经是最新：把之前留下的「有新版」清掉，否则横幅会一直挂着
    await runCommand("settings.set", { key: KV_UPDATE_LATEST, value: "" }).catch(() => undefined);
    await runCommand("settings.set", { key: KV_UPDATE_URL, value: "" }).catch(() => undefined);
  }
  return result;
}

/** 从 kv 读出「待更新」信息；没有就返回 null */
export function readPendingUpdate(
  kv: Record<string, string | undefined>,
  currentVersion: string,
): { version: string; url: string } | null {
  const version = kv[KV_UPDATE_LATEST] ?? "";
  if (version.length === 0) return null;
  // 防御：记录比当前版本旧（用户已经手动装了新版）时不提示
  if (compareVersion(version, currentVersion) <= 0) return null;
  const url = kv[KV_UPDATE_URL] ?? "";
  return { version, url: url.length > 0 ? url : RELEASES_URL };
}

/** 打开下载页 */
export async function openReleasesPage(url: string): Promise<void> {
  const { openExternalUrl } = await import("./links");
  await openExternalUrl(url);
}

export { compareVersion };

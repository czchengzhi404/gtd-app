import { Linking } from "react-native";

/**
 * 检查更新（移动端的「自动更新」等价物）。
 *
 * 桌面端由 electron-updater 静默下载安装；移动端侧载 APK 没有这个能力，
 * 能做的等价物是：查 GitHub 最新 release → 比版本 → 有新版就引导用户去下载页。
 *
 * 不自动下载：侧载应用装 APK 需要用户确认，静默安装会触发系统安全策略。
 */

const REPO = "czchengzhi404/gtd-app";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

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

/** 打开下载页 */
export async function openReleasesPage(url: string): Promise<void> {
  await Linking.openURL(url).catch(() => undefined);
}

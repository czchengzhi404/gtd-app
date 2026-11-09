/**
 * 更新判定的纯逻辑。
 *
 * 放在 core 而不是 apps/mobile：这段没有平台依赖（不碰 fetch、不碰 kv、不碰 Linking），
 * 但它决定了「要不要提示用户有新版本」——这是最容易写错又最难在设备上复现的地方
 * （得先真有一个更高版本的 release）。放这儿就能直接用单测钉住。
 */

/** 语义化版本比较：返回 >0 表示 a 比 b 新 */
export function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((part) => Number(part) || 0);
  const pb = b.replace(/^v/, "").split(".").map((part) => Number(part) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface PendingUpdate {
  version: string;
  url: string;
}

/**
 * 从 kv 快照里读出「待更新」信息。
 *
 * 两条防御：
 * 1. `update.latest` 为空（已是最新，或从没查过）→ 不提示
 * 2. 记录的版本不比当前版本新 → 不提示。用户可能手动装了新版，
 *    而 kv 里还留着旧通知，这时再弹横幅就是骚扰。
 */
export function readPendingUpdate(
  kv: Record<string, string | undefined>,
  currentVersion: string,
  fallbackUrl: string,
): PendingUpdate | null {
  const version = kv["update.latest"] ?? "";
  if (version.length === 0) return null;
  if (compareVersion(version, currentVersion) <= 0) return null;
  const url = kv["update.url"] ?? "";
  return { version, url: url.length > 0 ? url : fallbackUrl };
}

/** 自动检测的节流判定：上次成功查询距今不足 intervalMs 就不查 */
export function shouldAutoCheck(lastCheckedAt: number, now: number, intervalMs: number): boolean {
  if (!Number.isFinite(lastCheckedAt) || lastCheckedAt <= 0) return true;
  return now - lastCheckedAt >= intervalMs;
}

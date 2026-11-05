import type { SyncProvider } from "./types";

/**
 * 对方设备的可读信息。
 *
 * 同步目录里只有 `devices/<id>/manifest.json`（id → entry）与 records 快照，
 * 没有额外的"设备名片"文件。所以这里完全从已有产物推导：
 * - 记录数 = manifest 的 key 数（含墓碑）
 * - 最后活动时间 = manifest 里最大的 updatedAt（比文件 mtime 更可靠：
 *   网盘同步盘经常改写 mtime，但记录时间戳是内容本身的一部分）
 * 设备名不可知，只暴露短 id，避免伪造出"设备名"这种假信息。
 */
export interface PeerDeviceInfo {
  id: string;
  /** 末 6 位，用于 UI 展示 */
  shortId: string;
  recordCount: number;
  /** 最后活动时间（毫秒）；manifest 为空时为 null */
  lastActivityAt: number | null;
}

export function shortDeviceId(id: string): string {
  const cleaned = id.replace(/[^0-9a-zA-Z]/g, "");
  return (cleaned.length > 6 ? cleaned.slice(-6) : cleaned).toLowerCase();
}

/** 列出除自己以外的设备，按最后活动时间倒序（没活动的排最后） */
export async function describePeerDevices(
  provider: SyncProvider,
  selfId: string,
): Promise<PeerDeviceInfo[]> {
  const ids = (await provider.listDevices()).filter((id) => id !== selfId);
  const peers: PeerDeviceInfo[] = [];
  for (const id of ids) {
    const manifest = await provider.readManifest(id).catch(() => null);
    if (manifest === null) continue;
    const entries = Object.values(manifest);
    let last = 0;
    for (const entry of entries) {
      if (entry.updatedAt > last) last = entry.updatedAt;
    }
    peers.push({
      id,
      shortId: shortDeviceId(id),
      recordCount: entries.length,
      lastActivityAt: entries.length === 0 ? null : last,
    });
  }
  peers.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  return peers;
}

import type { TaggedRecord } from "../models/commands";
import type { Manifest, ManifestEntry } from "./types";

/**
 * 合并规则（定稿 v7 §3）：
 * ① revision 高者胜（单调本地计数器，不依赖时钟）
 * ② revision 并列 → updatedAt 新者胜（仅 tiebreak，容忍时钟偏差）
 * ③ 再并列 → id 字典序（同一 id 场景恒等，理论不可达，保留为最终决胜）
 * 墓碑作为普通记录参与比较：被更高 revision 的编辑击败则"复活"，预期行为。
 */

export function compareEntries(a: ManifestEntry, b: ManifestEntry): number {
  if (a.revision !== b.revision) return a.revision > b.revision ? 1 : -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 1 : -1;
  return a === b ? 0 : 1;
}

/** entry → record 的描述（用于反查谁赢了） */
function entryOf(record: TaggedRecord): ManifestEntry {
  return {
    revision: record.record.revision,
    updatedAt: record.record.updatedAt,
    deletedAt: record.record.deletedAt,
  };
}

/**
 * 合并单条记录：返回胜者，及本地是否需要更新（localNeedsUpdate=true 表示
 * 远端胜出，本地库应写入 remote；false 表示本地保持不变）。
 * local 为 undefined（本地没有这条记录）时远端直接胜出。
 */
export function mergeOne(
  local: TaggedRecord | undefined,
  remote: TaggedRecord,
): { winner: TaggedRecord; localNeedsUpdate: boolean } {
  if (local === undefined) {
    return { winner: remote, localNeedsUpdate: true };
  }
  const localEntry = entryOf(local);
  const remoteEntry = entryOf(remote);
  const cmp = compareEntries(localEntry, remoteEntry);
  if (cmp >= 0) {
    return { winner: local, localNeedsUpdate: false };
  }
  return { winner: remote, localNeedsUpdate: true };
}

/** 合并 manifest：逐 id 取较优 entry（与 mergeOne 同规则） */
export function mergeManifests(mine: Manifest, theirs: Manifest): Manifest {
  const result: Manifest = { ...mine };
  for (const [id, entry] of Object.entries(theirs)) {
    const current = result[id];
    if (current === undefined || compareEntries(current, entry) < 0) {
      result[id] = entry;
    }
  }
  return result;
}

/** 差异计算：对方有而我不一致（revision 或 updatedAt 或存在性）的 id 列表 */
export function idsToFetch(mine: Manifest, theirs: Manifest): string[] {
  const need: string[] = [];
  for (const [id, entry] of Object.entries(theirs)) {
    const local = mine[id];
    if (
      local === undefined ||
      local.revision !== entry.revision ||
      local.updatedAt !== entry.updatedAt ||
      (local.deletedAt ?? null) !== (entry.deletedAt ?? null)
    ) {
      need.push(id);
    }
  }
  return need;
}

/** 从快照中挑出待取记录 */
export function pickRecords(records: TaggedRecord[], ids: Set<string>): TaggedRecord[] {
  return records.filter((r) => ids.has(r.record.id));
}

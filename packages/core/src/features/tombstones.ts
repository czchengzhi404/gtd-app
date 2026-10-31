import type { SqliteExecutor } from "../platform/executor";

/**
 * 墓碑压缩：超过保留期的软删除记录物理删除，回收存储。
 *
 * 文档化语义（architecture §3）：墓碑参与同步合并 90 天后可压缩。
 * 权衡：若某设备超过 90 天没有拉取同步，其后的压缩会让它永远看不到
 * 这些删除（该记录会作为"复活"参与后续合并）——这是已文档化的取舍。
 * 同步开启与否都执行压缩：90 天对个人多设备场景足够宽裕。
 *
 * 门控在 bootstrapStore：以 kv["tombstone.lastCompactAt"] 为准，每 24h
 * 至多执行一次，避免每次启动都扫六张表。
 */

export const TOMBSTONE_RETENTION_DAYS = 90;
export const TOMBSTONE_COMPACT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function compactTombstones(
  executor: SqliteExecutor,
  now: number,
  retentionDays: number = TOMBSTONE_RETENTION_DAYS,
): Promise<number> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  // 表清单固定；SQL 内联字面量 + 参数绑定（纪律见 db/queries.ts）
  for (const table of ["tasks", "projects", "sections", "contexts", "areas", "attachments"] as const) {
    if (table === "tasks") {
      const info = await executor.run(
        "DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        [cutoff],
      );
      removed += info.changes;
    } else if (table === "projects") {
      const info = await executor.run(
        "DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        [cutoff],
      );
      removed += info.changes;
    } else if (table === "sections") {
      const info = await executor.run(
        "DELETE FROM sections WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        [cutoff],
      );
      removed += info.changes;
    } else if (table === "contexts") {
      const info = await executor.run(
        "DELETE FROM contexts WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        [cutoff],
      );
      removed += info.changes;
    } else if (table === "areas") {
      const info = await executor.run(
        "DELETE FROM areas WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        [cutoff],
      );
      removed += info.changes;
    } else {
      const info = await executor.run(
        "DELETE FROM attachments WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        [cutoff],
      );
      removed += info.changes;
    }
  }
  return removed;
}

/** bootstrap 门控：距上次压缩不足 24h 则跳过；执行过则写回标记 */
export async function maybeCompactTombstones(executor: SqliteExecutor, now: number): Promise<number> {
  const rows = await executor.query<{ value: string }>(
    "SELECT value FROM kv WHERE key = 'tombstone.lastCompactAt'",
  );
  const last = rows[0]?.value;
  if (last !== undefined && now - Number(last) < TOMBSTONE_COMPACT_INTERVAL_MS) {
    return 0;
  }
  const removed = await compactTombstones(executor, now);
  await executor.run(
    "INSERT INTO kv (key, value) VALUES ('tombstone.lastCompactAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(now)],
  );
  return removed;
}

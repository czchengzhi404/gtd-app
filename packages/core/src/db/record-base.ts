import type { TaggedRecord } from "../models/commands";
import type { SqliteExecutor, SqliteRow } from "../platform/executor";

/**
 * 基线快照（schema v6 的 `record_base` 表）。
 *
 * 定位：记录"上次与外部一致时"的记录内容 —— 即本机最后一次把该记录写进自身
 * 快照（`devices/<id>/records.json`）时的样子。它是任务字段级 3-way 合并的
 * base：没有 base 就无法区分"对方改了字段"与"我改了字段"。
 *
 * 纪律：
 * - 只做存储，不含合并判定（合并判定是纯函数，见 sync/fieldmerge.ts）；
 * - 所有 SQL 均为文件内单一静态字符串 + 参数绑定；
 * - 表内容不参与同步交换，各设备独立维护（base 是本地推导状态，不是业务数据）；
 * - payload 存实体字段的原始 JSON（不做字段裁剪），读回时校验 id 与结构，
 *   任何损坏都退化为"无基线"（合并退回整条 LWW，绝不因坏数据丢本地修改）。
 */

/** 单条 upsert：主键冲突即覆盖 payload 与捕获时间 */
export const SQL_UPSERT_RECORD_BASE =
  "INSERT INTO record_base (record_id, payload, captured_at) VALUES (?, ?, ?) ON CONFLICT(record_id) DO UPDATE SET payload = excluded.payload, captured_at = excluded.captured_at";

export const SQL_SELECT_RECORD_BASE = "SELECT payload FROM record_base WHERE record_id = ?";

/** 单次快照事务的行数上限：与会话批同量级，避免大库一次长事务长时间持写锁 */
export const BASE_SNAPSHOT_BATCH_SIZE = 300;

/** 记录 → 基线 JSON（实体字段原样序列化；不裁剪字段，保证合并时字段集一致） */
export function recordBasePayload(tagged: TaggedRecord): string {
  return JSON.stringify(tagged.record);
}

/** 单条 upsert（调用方负责事务边界） */
export async function upsertRecordBase(
  tx: SqliteExecutor,
  tagged: TaggedRecord,
  capturedAt: number,
): Promise<void> {
  await tx.run(SQL_UPSERT_RECORD_BASE, [tagged.record.id, recordBasePayload(tagged), capturedAt]);
}

/**
 * 读取基线快照（含墓碑记录的基线）。返回该记录的原始字段对象；
 * 不存在、损坏、或 id 不匹配 → null（调用方据此退回整条 LWW）。
 */
export async function readRecordBase(
  tx: SqliteExecutor,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await tx.query<SqliteRow>(SQL_SELECT_RECORD_BASE, [recordId]);
  if (rows.length === 0) return null;
  const payload = rows[0]?.payload;
  if (typeof payload !== "string" || payload.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const snapshot = parsed as Record<string, unknown>;
    // 防御：payload 不属于该 id（文件/库被人工改动过）时视为无基线
    return snapshot.id === recordId ? snapshot : null;
  } catch {
    return null;
  }
}

/**
 * 批量快照（syncNow 写完自身快照后调用，含墓碑）：逐行 upsert，
 * 每 `BASE_SNAPSHOT_BATCH_SIZE` 行一个独立 immediate 事务。
 * 返回写入行数。
 */
export async function captureRecordBases(
  executor: SqliteExecutor,
  records: TaggedRecord[],
  capturedAt: number,
): Promise<number> {
  let written = 0;
  for (let start = 0; start < records.length; start += BASE_SNAPSHOT_BATCH_SIZE) {
    const batch = records.slice(start, start + BASE_SNAPSHOT_BATCH_SIZE);
    await executor.transaction(async (tx) => {
      for (const record of batch) {
        await upsertRecordBase(tx, record, capturedAt);
      }
    }, "immediate");
    written += batch.length;
  }
  return written;
}

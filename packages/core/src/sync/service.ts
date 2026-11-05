import type { CommandPort } from "../platform/ports";
import { getCommandPort, getSqliteExecutor } from "../platform/ports";
import { executeCommand } from "../db/commands";
import type { CommandContext } from "../db/commands";
import { getKvValue } from "../db/queries";
import {
  getTasks,
  getProjects,
  getSections,
  getContexts,
  getAreas,
  getTemplates,
  getAllActiveAttachments,
} from "../db/queries";
import type { TaggedRecord } from "../models/commands";
import type { SqliteExecutor } from "../platform/executor";
import { captureRecordBases } from "../db/record-base";
import { recordLabel } from "./fieldmerge";
import { idsToFetch, pickRecords } from "./merge";
import { chunkRecords } from "./types";
import type {
  ConflictSample,
  FieldMergeReportEntry,
  Manifest,
  SyncApplyOutcome,
  SyncProvider,
  SyncReport,
  SyncConfig,
  SyncProgress,
} from "./types";

/**
 * 同步编排：
 * 1. 读取自身 manifest（从本地库构建，含墓碑）
 * 2. 遍历远端设备 manifest，按 revision 差异计算待取 id
 * 3. 拉取对方 records 快照，挑出待取记录
 * 4. 经 sync.applyRemote 按批应用（每批独立 immediate 事务，默认 200–500 条）
 *    —— 整条 LWW 之外，任务在"本地 revision 更高 + 有基线"时走字段级 3-way
 * 5. 回写自身 manifest + records 快照
 * 6. 把本次写出的记录（含墓碑）批量 upsert 进 record_base，作为下次合并的 base
 */

export const DEFAULT_BATCH_SIZE = 300;

export function buildLocalManifest(executor: SqliteExecutor): Promise<Manifest> {
  return collectLocalRecords(executor).then((records) => {
    const manifest: Manifest = {};
    for (const r of records) {
      manifest[r.record.id] = {
        revision: r.record.revision,
        updatedAt: r.record.updatedAt,
        deletedAt: r.record.deletedAt,
      };
    }
    return manifest;
  });
}

/** 本地全量记录（含墓碑）——附件元数据随任务分批查询 */
export async function collectLocalRecords(executor: SqliteExecutor): Promise<TaggedRecord[]> {
  const [tasks, projects, sections, contexts, areas, templates] = await Promise.all([
    getTasks(executor, { includeDone: true }),
    getProjects(executor),
    getSections(executor),
    getContexts(executor),
    getAreas(executor),
    // includeDeleted：模板墓碑必须参与同步，删除才能传播
    getTemplates(executor, true),
  ]);
  const records: TaggedRecord[] = [
    ...tasks.map((record) => ({ type: "task", record }) as TaggedRecord),
    ...projects.map((record) => ({ type: "project", record }) as TaggedRecord),
    ...sections.map((record) => ({ type: "section", record }) as TaggedRecord),
    ...contexts.map((record) => ({ type: "context", record }) as TaggedRecord),
    ...areas.map((record) => ({ type: "area", record }) as TaggedRecord),
    ...templates.map((record) => ({ type: "template", record }) as TaggedRecord),
  ];
  // 附件一次全表查（原先是按任务逐个查的 N+1：真机上每次 query 都要跨原生桥）。
  // 全表查同时补上了旧实现的漏洞——墓碑任务下未删除的附件此前不会被收集。
  const attachments = await getAllActiveAttachments(executor);
  for (const record of attachments) {
    records.push({ type: "attachment", record });
  }
  // 墓碑记录：直接扫全表（含墓碑），保证删除能传播
  const tombstones = await queryTombstones(executor);
  records.push(...tombstones);
  return records;
}

/**
 * 记录集指纹（FNV-1a 32 位）。
 *
 * 用途：自动同步会**频繁**触发（前后台切换、定时器），但绝大多数时候本地没有任何
 * 改动。此时仍然上传一份完整的 records.json 纯属浪费——尤其走 WebDAV/S3 时是实打实的
 * 流量与耗时。用指纹比对上次推送的内容，没变就跳过写入。
 *
 * 为什么用哈希而不是直接存 JSON：指纹只有 8 个字符，放进 kv 不占空间，
 * 也不需要把上百万字符的记录集再读回来比对。
 */
function fingerprintRecords(records: TaggedRecord[]): string {
  let hash = 0x811c9dc5;
  for (const record of records) {
    const text = `${record.type}:${record.record.id}:${record.record.revision}:${record.record.updatedAt};`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const FINGERPRINT_KEY = "sync.lastPushFingerprint";

function finishedNow(deps: SyncDeps): number {
  return deps.now?.() ?? Date.now();
}

async function readKvValue(executor: SqliteExecutor, key: string): Promise<string | null> {
  const rows = await executor.query<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function writeKvValue(
  executor: SqliteExecutor,
  key: string,
  value: string,
  now: number,
): Promise<void> {
  void now;
  // 注意：kv 表只有 (key, value) 两列——早先按 (key, value, updated_at) 写入会被 SQLite
  // 直接拒绝，而调用方又把异常吞掉了，导致"跳过推送"永远不生效。这里对齐真实 schema。
  await executor.run(
    `INSERT INTO kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/** 查询各表墓碑（deleted_at IS NOT NULL）——getTasks 系列默认排除墓碑 */
async function queryTombstones(executor: SqliteExecutor): Promise<TaggedRecord[]> {
  const { taskFromRow, projectFromRow, sectionFromRow, contextFromRow, areaFromRow, attachmentFromRow } =
    await import("../db/mappers");
  const rowsOf = async (sql: string) => executor.query<Record<string, unknown>>(sql);
  const records: TaggedRecord[] = [];
  for (const row of await rowsOf("SELECT * FROM tasks WHERE deleted_at IS NOT NULL")) {
    records.push({ type: "task", record: taskFromRow(row) });
  }
  for (const row of await rowsOf("SELECT * FROM projects WHERE deleted_at IS NOT NULL")) {
    records.push({ type: "project", record: projectFromRow(row) });
  }
  for (const row of await rowsOf("SELECT * FROM sections WHERE deleted_at IS NOT NULL")) {
    records.push({ type: "section", record: sectionFromRow(row) });
  }
  for (const row of await rowsOf("SELECT * FROM contexts WHERE deleted_at IS NOT NULL")) {
    records.push({ type: "context", record: contextFromRow(row) });
  }
  for (const row of await rowsOf("SELECT * FROM areas WHERE deleted_at IS NOT NULL")) {
    records.push({ type: "area", record: areaFromRow(row) });
  }
  for (const row of await rowsOf("SELECT * FROM attachments WHERE deleted_at IS NOT NULL")) {
    records.push({ type: "attachment", record: attachmentFromRow(row) });
  }
  return records;
}

export interface SyncDeps {
  provider: SyncProvider;
  /** 本地库执行器（构建自身 manifest / 回写前重读） */
  executor: SqliteExecutor;
  /**
   * 应用远端记录的命令入口：渲染进程传 CommandPort；主进程/测试可直接给 executor。
   * 返回裸 `TaggedRecord[]` 仍然合法（字段级合并明细则缺席，报告里字段名为空）。
   */
  apply: (records: TaggedRecord[]) => Promise<TaggedRecord[] | SyncApplyOutcome>;
  deviceId: string;
  now?: () => number;
  batchSize?: number;
  /** 进度回调（可选）：UI 用来显示「正在拉取 3/120」 */
  onProgress?: (progress: SyncProgress) => void;
}

export function createSyncApplyForRenderer(): SyncDeps["apply"] {
  const port: CommandPort = getCommandPort();
  return async (records) => {
    // records 为本应用序列化的实体（coerceTaggedRecords 在接收端再次校验）
    const result = await port.dispatch("sync.applyRemote", {
      records,
    } as unknown as import("../models/commands").CommandMap["sync.applyRemote"]);
    return { applied: result.records, mergeSummary: result.mergeSummary };
  };
}

export function createSyncDepsForExecutor(executor: SqliteExecutor, ctx: CommandContext): SyncDeps["apply"] {
  return async (records) => {
    const result = await executeCommand(executor, "sync.applyRemote", { records }, ctx);
    return { applied: result.records, mergeSummary: result.mergeSummary };
  };
}

export async function syncNow(deps: SyncDeps): Promise<SyncReport> {
  const startedAt = deps.now?.() ?? Date.now();
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const executor = deps.executor;
  const emit = (progress: SyncProgress) => deps.onProgress?.(progress);

  // 1) 本地 manifest
  emit({ phase: "manifest", done: 0, total: 1 });
  const myManifest = await buildLocalManifest(executor);
  emit({ phase: "manifest", done: 1, total: 1 });

  // 2) 远端设备清单
  const deviceIds = (await deps.provider.listDevices()).filter((d) => d !== deps.deviceId);
  emit({ phase: "pull", done: 0, total: deviceIds.length, deviceCount: deviceIds.length });

  // 3) 按差异拉取并应用
  let applied = 0;
  let remoteWins = 0;
  let localWins = 0;
  let fieldMergedRecords = 0;
  let fieldMergeSkipped = 0;
  const conflictSamples: ConflictSample[] = [];
  const fieldMerges: FieldMergeReportEntry[] = [];
  const mergedFieldNames = new Set<string>();
  const conflictFieldNames = new Set<string>();
  let deviceIndex = 0;
  for (const deviceId of deviceIds) {
    deviceIndex += 1;
    const theirManifest = await deps.provider.readManifest(deviceId);
    if (theirManifest !== null) {
      const need = idsToFetch(myManifest, theirManifest);
      if (need.length > 0) {
        const theirRecords = await deps.provider.readRecords(deviceId);
        const incoming = pickRecords(theirRecords, new Set(need));
        // 按批应用：每批一个独立 immediate 事务（批间显式释放）
        let batchDone = 0;
        for (const batch of chunkRecords(incoming, batchSize)) {
          const outcome = await deps.apply(batch);
          // 兼容只回数组的实现
          const appliedBatch = Array.isArray(outcome) ? outcome : outcome.applied;
          const mergeSummary = Array.isArray(outcome) ? undefined : outcome.mergeSummary;
          const appliedIds = new Set(appliedBatch.map((record) => record.record.id));
          const mergedIds = new Set<string>();

          if (mergeSummary !== undefined) {
            for (const field of mergeSummary.mergedFields) mergedFieldNames.add(field);
            for (const field of mergeSummary.conflictFields) conflictFieldNames.add(field);
            fieldMergeSkipped +=
              mergeSummary.noBaseConflicts.length +
              mergeSummary.unmergeable.length +
              mergeSummary.staleRemotes.length;

            for (const entry of mergeSummary.entries) {
              const label = fieldMergeLabel(entry.recordId, appliedBatch, batch);
              // 合并后写回的记录才计入 fieldMerges 的写入计数
              if (entry.mergedFields.length > 0) {
                mergedIds.add(entry.recordId);
                fieldMerges.push({
                  deviceId,
                  recordId: entry.recordId,
                  label,
                  mergedFields: [...entry.mergedFields],
                  conflictFields: [...entry.conflictFields],
                });
              }
              if (entry.conflictFields.length > 0 && conflictSamples.length < 10) {
                conflictSamples.push({
                  deviceId,
                  kind: "task",
                  recordId: entry.recordId,
                  label,
                  reason: "field-merge",
                  conflictFields: [...entry.conflictFields],
                  mergedFields: [...entry.mergedFields],
                });
              }
            }
          }

          applied += appliedBatch.length;
          remoteWins += Math.max(0, appliedBatch.length - mergedIds.size);
          fieldMergedRecords += mergedIds.size;
          localWins += batch.length - appliedBatch.length;
          // 冲突样本：整条未被采纳 = 本地 revision 更高而被整体保留（无字段级合并事件）
          if (appliedBatch.length < batch.length) {
            for (const remote of batch) {
              if (appliedIds.has(remote.record.id)) continue;
              if (mergedIds.has(remote.record.id)) continue;
              if (conflictSamples.length >= 10) break;
              conflictSamples.push({
                deviceId,
                kind: remote.type,
                recordId: remote.record.id,
                label: recordLabel(remote),
                reason: "local-revision-higher",
              });
            }
          }
          batchDone += batch.length;
          emit({
            phase: "apply",
            done: batchDone,
            total: incoming.length,
            device: deviceIndex,
            deviceCount: deviceIds.length,
          });
        }
      }
    }
    emit({
      phase: "pull",
      done: deviceIndex,
      total: deviceIds.length,
      device: deviceIndex,
      deviceCount: deviceIds.length,
    });
  }

  // 5) 回写自身最新状态（含本地胜出的记录与墓碑）
  const finalManifest = await buildLocalManifest(executor);
  const finalRecords = await collectLocalRecords(executor);
  emit({ phase: "push", done: 0, total: finalRecords.length });

  // 增量推送：记录集与上次推送完全一致时跳过写 records。
  // 自动同步会被前后台切换/定时器频繁触发，而多数时候本地毫无改动——
  // 走 WebDAV/S3 时，省下的是整份快照的上传流量与延迟。
  // manifest 仍然写（体积小，且设备在线状态要更新）。
  const fingerprint = fingerprintRecords(finalRecords);
  const lastFingerprint = await readKvValue(executor, FINGERPRINT_KEY).catch(() => null);
  const recordsUnchanged = lastFingerprint === fingerprint;

  await deps.provider.writeManifest(deps.deviceId, finalManifest);
  if (recordsUnchanged) {
    emit({ phase: "push", done: finalRecords.length, total: finalRecords.length });
  } else {
    await deps.provider.writeRecords(deps.deviceId, finalRecords);
    await writeKvValue(executor, FINGERPRINT_KEY, fingerprint, finishedNow(deps)).catch(
      () => undefined,
    );
    emit({ phase: "push", done: finalRecords.length, total: finalRecords.length });
  }

  const finishedAt = deps.now?.() ?? Date.now();

  // 6) 基线快照：把本次写出的记录（含墓碑）批量 upsert 进 record_base，
  //    作为下次 3-way 合并的 base。失败不影响本次同步（下次退化为整条 LWW）。
  let baseSnapshotFailed = false;
  try {
    await captureRecordBases(executor, finalRecords, finishedAt);
  } catch {
    baseSnapshotFailed = true;
  }

  const durationMs = Math.max(0, finishedAt - startedAt);
  // 冲突日志（不参与同步，各设备独立）：供「更多 → 同步日志」展示
  try {
    await executeCommand(
      executor,
      "settings.set",
      {
        key: "sync.log",
        value: JSON.stringify({
          at: finishedAt,
          applied,
          localWins,
          remoteWins,
          devices: deviceIds.length,
          conflicts: conflictSamples,
          fieldMergedRecords,
          fieldMerges,
          mergedFields: [...mergedFieldNames].sort(),
          conflictFields: [...conflictFieldNames].sort(),
          durationMs,
        }),
      },
      { now: () => finishedAt },
    );
  } catch {
    /* 日志写入失败不影响同步结果 */
  }

  return {
    deviceId: deps.deviceId,
    applied,
    localWins,
    remoteWins,
    pushed: finalRecords.length,
    devices: deviceIds.length,
    startedAt,
    finishedAt,
    durationMs,
    conflictSamples,
    fieldMergedRecords,
    fieldMerges,
    mergedFields: [...mergedFieldNames].sort(),
    conflictFields: [...conflictFieldNames].sort(),
    fieldMergeSkipped,
    baseSnapshotFailed,
  };
}

/** 字段级合并明细的展示标签：优先用写回后的记录，其次用远端记录 */
function fieldMergeLabel(
  recordId: string,
  appliedBatch: TaggedRecord[],
  batch: TaggedRecord[],
): string {
  const written = appliedBatch.find((record) => record.record.id === recordId);
  if (written !== undefined) return recordLabel(written);
  const incoming = batch.find((record) => record.record.id === recordId);
  if (incoming !== undefined) return recordLabel(incoming);
  return recordId.slice(0, 8);
}

/** 设备 id：首次生成后存 kv（不参与同步） */
export async function getOrCreateDeviceId(executor: SqliteExecutor): Promise<string> {
  const existing = await getKvValue(executor, "device_id");
  if (existing !== null && existing.length > 0) return existing;
  const { executeCommand: runCmd } = await import("../db/commands");
  const { uuidv7 } = await import("../db/ids");
  const id = uuidv7();
  await runCmd(executor, "settings.set", { key: "device_id", value: id }, { now: () => Date.now() });
  return id;
}

export async function getSyncConfig(executor: SqliteExecutor): Promise<SyncConfig | null> {
  const raw = await getKvValue(executor, "sync.config");
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    if (
      (parsed.kind === "webdav" || parsed.kind === "http" || parsed.kind === "folder") &&
      typeof parsed.endpoint === "string" &&
      parsed.endpoint.length > 0
    ) {
      return {
        kind: parsed.kind,
        endpoint: parsed.endpoint,
        username: parsed.username,
        password: parsed.password,
        enabled: parsed.enabled === true,
      };
    }
  } catch {
    /* 配置损坏视为未配置 */
  }
  return null;
}

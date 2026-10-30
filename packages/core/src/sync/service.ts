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
  getAttachmentsForTask,
} from "../db/queries";
import type { TaggedRecord } from "../models/commands";
import type { SqliteExecutor } from "../platform/executor";
import { idsToFetch, pickRecords } from "./merge";
import { chunkRecords } from "./types";
import type { Manifest, SyncProvider, SyncReport, SyncConfig } from "./types";

/**
 * 同步编排：
 * 1. 读取自身 manifest（从本地库构建，含墓碑）
 * 2. 遍历远端设备 manifest，按 revision 差异计算待取 id
 * 3. 拉取对方 records 快照，挑出待取记录
 * 4. 经 sync.applyRemote 按批应用（每批独立 immediate 事务，默认 200–500 条）
 * 5. 回写自身 manifest + records 快照
 * 冲突处理全部发生在 applyRemote 的逐条合并里（revision 优先，见 sync/merge.ts）。
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
  const [tasks, projects, sections, contexts, areas] = await Promise.all([
    getTasks(executor, { includeDone: true }),
    getProjects(executor),
    getSections(executor),
    getContexts(executor),
    getAreas(executor),
  ]);
  const records: TaggedRecord[] = [
    ...tasks.map((record) => ({ type: "task", record }) as TaggedRecord),
    ...projects.map((record) => ({ type: "project", record }) as TaggedRecord),
    ...sections.map((record) => ({ type: "section", record }) as TaggedRecord),
    ...contexts.map((record) => ({ type: "context", record }) as TaggedRecord),
    ...areas.map((record) => ({ type: "area", record }) as TaggedRecord),
  ];
  // 墓碑任务不在 getTasks 结果里：附件只挂活跃任务，元数据量小，按任务逐个查
  for (const task of tasks) {
    const attachments = await getAttachmentsForTask(executor, task.id);
    for (const record of attachments) {
      records.push({ type: "attachment", record });
    }
  }
  // 墓碑记录：直接扫全表（含墓碑），保证删除能传播
  const tombstones = await queryTombstones(executor);
  records.push(...tombstones);
  return records;
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
  /** 应用远端记录的命令入口：渲染进程传 CommandPort；主进程/测试可直接给 executor */
  apply: (
    records: TaggedRecord[],
  ) => Promise<TaggedRecord[]>;
  deviceId: string;
  now?: () => number;
  batchSize?: number;
}

export function createSyncApplyForRenderer(): SyncDeps["apply"] {
  const port: CommandPort = getCommandPort();
  return async (records) => {
    // records 为本应用序列化的实体（coerceTaggedRecords 在接收端再次校验）
    const result = await port.dispatch("sync.applyRemote", {
      records,
    } as unknown as import("../models/commands").CommandMap["sync.applyRemote"]);
    return result.records;
  };
}

export function createSyncDepsForExecutor(executor: SqliteExecutor, ctx: CommandContext): SyncDeps["apply"] {
  return async (records) => {
    const result = await executeCommand(executor, "sync.applyRemote", { records }, ctx);
    return result.records;
  };
}

export async function syncNow(deps: SyncDeps): Promise<SyncReport> {
  const startedAt = deps.now?.() ?? Date.now();
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const executor = deps.executor;

  // 1) 本地 manifest
  const myManifest = await buildLocalManifest(executor);

  // 2) 远端设备清单
  const deviceIds = (await deps.provider.listDevices()).filter((d) => d !== deps.deviceId);

  // 3) 按差异拉取并应用
  let applied = 0;
  let remoteWins = 0;
  let localWins = 0;
  const conflictSamples: { deviceId: string; kind: string; label: string; reason: string }[] = [];
  for (const deviceId of deviceIds) {
    const theirManifest = await deps.provider.readManifest(deviceId);
    if (theirManifest === null) continue;
    const need = idsToFetch(myManifest, theirManifest);
    if (need.length === 0) continue;
    const theirRecords = await deps.provider.readRecords(deviceId);
    const incoming = pickRecords(theirRecords, new Set(need));
    // 按批应用：每批一个独立 immediate 事务（批间显式释放）
    for (const batch of chunkRecords(incoming, batchSize)) {
      const appliedBatch = await deps.apply(batch);
      applied += appliedBatch.length;
      remoteWins += appliedBatch.length;
      localWins += batch.length - appliedBatch.length;
      // 冲突样本：远端条目未被采纳 = 本地 revision 更高而被保留
      if (appliedBatch.length < batch.length) {
        const appliedIds = new Set(appliedBatch.map((record) => record.record.id));
        for (const remote of batch) {
          if (appliedIds.has(remote.record.id)) continue;
          if (conflictSamples.length >= 10) break;
          const record = remote.record as { title?: string; name?: string };
          conflictSamples.push({
            deviceId,
            kind: remote.type,
            label: record.title ?? record.name ?? remote.record.id.slice(0, 8),
            reason: "local-revision-higher",
          });
        }
      }
    }
  }

  // 4) 回写自身最新状态（含本地胜出的记录与墓碑）
  const finalManifest = await buildLocalManifest(executor);
  const finalRecords = await collectLocalRecords(executor);
  await deps.provider.writeManifest(deps.deviceId, finalManifest);
  await deps.provider.writeRecords(deps.deviceId, finalRecords);

  const finishedAt = deps.now?.() ?? Date.now();
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
  };
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

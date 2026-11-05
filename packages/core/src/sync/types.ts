import type { FieldMergeSummary, TaggedRecord } from "../models/commands";

/**
 * 同步数据模型：每台设备把自己的全部记录（含墓碑）写成一份 manifest + 一份
 * records 快照，存放在 `devices/<deviceId>/` 下。同步 = 交换 manifest →
 * 按 revision 差异拉取对方 records → 按合并规则应用 → 回写自己的状态。
 * 纯文件存储，对 WebDAV / 自托管 HTTP / 本地文件夹一视同仁。
 */

/** manifest 条目：同步决胜所需的三个字段（id → entry） */
export interface ManifestEntry {
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** 单台设备的 manifest：recordId → entry。id 全局唯一（uuid），跨类型同一命名空间 */
export type Manifest = Record<string, ManifestEntry>;

export interface DeviceSnapshot {
  manifest: Manifest;
  records: TaggedRecord[];
}

export const SYNC_FILE_LAYOUT = {
  devicesDir: "devices",
  manifestFile: "manifest.json",
  recordsFile: "records.json",
} as const;

export interface SyncConfig {
  kind: "webdav" | "http" | "folder" | "s3";
  /** WebDAV/HTTP：服务端根地址；folder：本地目录；s3：服务端根地址（如 https://oss-cn-hangzhou.aliyuncs.com） */
  endpoint: string;
  username?: string;
  password?: string;
  enabled: boolean;
  /** S3 专用字段 */
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** 预设：一键填充常见网盘/存储服务的同步配置 */
export type SyncPresetKind = "nutstore" | "webdav" | "s3" | "folder";

export interface SyncPreset {
  kind: SyncPresetKind;
  labelKey: string;
  icon: string;
  /** 预填的 endpoint 模板（{username} 占位符会被替换） */
  endpointTemplate?: string;
  /** 需要填写的字段 */
  fields: ("username" | "password" | "endpoint" | "bucket" | "region" | "accessKeyId" | "secretAccessKey")[];
  /** 桌面端限定 */
  desktopOnly?: boolean;
  /** 说明文字 */
  hintKey: string;
}

export const SYNC_PRESETS: SyncPreset[] = [
  {
    kind: "nutstore",
    labelKey: "preset.nutstore",
    icon: "cloud-outline",
    endpointTemplate: "https://dav.jianguoyun.com/dav/",
    fields: ["username", "password"],
    hintKey: "preset.nutstoreHint",
  },
  {
    kind: "webdav",
    labelKey: "preset.customWebdav",
    icon: "globe-outline",
    fields: ["endpoint", "username", "password"],
    hintKey: "preset.customWebdavHint",
  },
  {
    kind: "s3",
    labelKey: "preset.s3",
    icon: "server-outline",
    fields: ["endpoint", "bucket", "region", "accessKeyId", "secretAccessKey"],
    hintKey: "preset.s3Hint",
  },
  {
    kind: "folder",
    labelKey: "preset.folder",
    icon: "folder-outline",
    fields: ["endpoint"],
    desktopOnly: true,
    hintKey: "preset.folderHint",
  },
];

/**
 * 一批远端记录的应用结果。
 *
 * 兼容性：`SyncDeps.apply` 允许实现方继续只返回 `TaggedRecord[]`（旧实现、
 * 外部测试的自定义 apply 都不需要改），需要字段级合并明细时再返回本形状。
 */
export interface SyncApplyOutcome {
  /** 实际写入/变更的本地记录（含字段级合并后写回的记录） */
  applied: TaggedRecord[];
  /** 字段级合并汇总（仅 task 类型产生） */
  mergeSummary?: FieldMergeSummary;
}

export interface SyncReport {
  deviceId: string;
  /** 应用到本地的远端记录数（含字段级合并写回的记录） */
  applied: number;
  /** 本地整条胜出、远端需更新的记录数 */
  localWins: number;
  /** 远端整条胜出的记录数（不含字段级合并写回的记录） */
  remoteWins: number;
  /** 本次写出的自身记录快照条数（含墓碑；不代表"变更条数"） */
  pushed: number;
  /** 参与同步的设备数（不含自身） */
  devices: number;
  startedAt: number;
  finishedAt: number;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 冲突样本：远端版本因本地 revision 更高而未采纳（最多 10 条） */
  conflictSamples: ConflictSample[];
  /** 字段级合并并写回的记录数（已计入 applied，不计入 remoteWins） */
  fieldMergedRecords: number;
  /** 字段级合并明细（最多 10 条，与 conflictSamples 同量级） */
  fieldMerges: FieldMergeReportEntry[];
  /** 本次采纳了远端值的字段名并集（去重、字典序） */
  mergedFields: string[];
  /** 本次双方都改、保留本机值的字段名并集（去重、字典序） */
  conflictFields: string[];
  /** 本次跳过字段级合并的记录数（无基线 / 非任务 / 任一端墓碑 / 远端陈旧副本） */
  fieldMergeSkipped: number;
  /** 基线快照写入是否失败（失败 = 下次同步仍退化为整条 LWW） */
  baseSnapshotFailed: boolean;
}

/** 冲突样本（最多 10 条）：整条落败或字段级冲突 */
export interface ConflictSample {
  deviceId: string;
  kind: string;
  /** 记录 id（UI 可据此定位任务；label 是远端那一版的标题） */
  recordId: string;
  label: string;
  /** 冲突成因：整条 LWW 本地胜 / 字段级冲突（本地保留部分字段） */
  reason: "local-revision-higher" | "field-merge";
  /** 字段级冲突时：保留本机值的字段名（让 UI 能说"标题被本机覆盖"） */
  conflictFields?: string[];
  /** 字段级合并时：采纳远端值的字段名 */
  mergedFields?: string[];
}

/** 字段级合并明细（单条记录） */
export interface FieldMergeReportEntry {
  deviceId: string;
  recordId: string;
  /** 展示用标签（任务标题 / 其它记录的 name） */
  label: string;
  /** 采纳远端值的字段名 */
  mergedFields: string[];
  /** 保留本机值的冲突字段名 */
  conflictFields: string[];
}

/** 同步进度：供 UI 显示「正在拉取 3/120」，避免大库首次同步像卡死 */
export interface SyncProgress {
  phase: "manifest" | "pull" | "apply" | "push";
  done: number;
  total: number;
  /** 当前处理的对方设备（1-based） */
  device?: number;
  deviceCount?: number;
}

/** 同步 Provider 端口：对"一堆文件"的读写，后端无关 */
export interface SyncProvider {
  /** 列出远端已有设备 id（含自身——调用方负责跳过） */
  listDevices(): Promise<string[]>;
  readManifest(deviceId: string): Promise<Manifest | null>;
  writeManifest(deviceId: string, manifest: Manifest): Promise<void>;
  readRecords(deviceId: string): Promise<TaggedRecord[]>;
  writeRecords(deviceId: string, records: TaggedRecord[]): Promise<void>;
}

/** 云端备份文件信息 */
export interface CloudBackupInfo {
  fileName: string;
  size: number;
  modifiedAt: string;
}

/** 云端备份端口：在同步通道上读写备份文件（独立于同步数据的 /backups/ 目录） */
export interface CloudBackupPort {
  list(): Promise<CloudBackupInfo[]>;
  upload(fileName: string, content: string): Promise<void>;
  download(fileName: string): Promise<string | null>;
  remove(fileName: string): Promise<void>;
}

/** 分批：每批一个独立 immediate 事务（端口契约：默认 200–500 条/批） */
export function chunkRecords<T>(records: T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.trunc(batchSize));
  const batches: T[][] = [];
  for (let i = 0; i < records.length; i += size) {
    batches.push(records.slice(i, i + size));
  }
  return batches;
}

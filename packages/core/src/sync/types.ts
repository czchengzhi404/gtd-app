import type { TaggedRecord } from "../models/commands";

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

export interface SyncReport {
  deviceId: string;
  /** 应用到本地的远端记录数 */
  applied: number;
  /** 本地胜出、远端需更新的记录数 */
  localWins: number;
  /** 远端胜出的记录数 */
  remoteWins: number;
  /** 推送的自身记录总数（含墓碑） */
  pushed: number;
  /** 参与同步的设备数（不含自身） */
  devices: number;
  startedAt: number;
  finishedAt: number;
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

/** 分批：每批一个独立 immediate 事务（端口契约：默认 200–500 条/批） */
export function chunkRecords<T>(records: T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.trunc(batchSize));
  const batches: T[][] = [];
  for (let i = 0; i < records.length; i += size) {
    batches.push(records.slice(i, i + size));
  }
  return batches;
}

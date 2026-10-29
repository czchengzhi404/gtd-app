import type { Manifest, SyncProvider, SyncConfig } from "./types";
import { SYNC_FILE_LAYOUT } from "./types";
import type { FilesPort } from "../platform/ports";
import type { TaggedRecord } from "../models/commands";
import { createS3Provider } from "./s3";

/**
 * 三种 Provider 共用同一文件布局（devices/<deviceId>/{manifest.json, records.json}）。
 * - WebDAV / 自托管 HTTP：fetch 实现（不引 axios——SDK 57 Bun 下导出失败已知问题）
 * - 文件夹：FilesPort 注入（桌面端主进程执行 fs，路径白名单见 main 进程）
 *
 * HTTP 语义差异：WebDAV 需要 MKCOL 建目录 + PROPFIND 列目录；自托管 HTTP 约定
 * `GET <base>/index`（设备 id 列表）；文件夹用 FilesPort 的目录能力。
 */

async function ensureOk(res: Response, what: string): Promise<void> {
  if (!res.ok && res.status !== 404) {
    throw new Error(`${what} 失败：HTTP ${res.status}`);
  }
}

function authHeaders(config: SyncConfig): Record<string, string> {
  if (config.username !== undefined || config.password !== undefined) {
    const token = btoa(`${config.username ?? ""}:${config.password ?? ""}`);
    return { Authorization: `Basic ${token}` };
  }
  return {};
}

function deviceBase(config: SyncConfig, deviceId: string): string {
  const base = config.endpoint.replace(/\/+$/, "");
  return `${base}/${SYNC_FILE_LAYOUT.devicesDir}/${encodeURIComponent(deviceId)}`;
}

/** 远端 404 → null（尚未写入），其它错误抛出 */
async function fetchJson<T>(url: string, config: SyncConfig): Promise<T | null> {
  const res = await fetch(url, { headers: { ...authHeaders(config) } });
  if (res.status === 404) return null;
  await ensureOk(res, `GET ${url}`);
  return (await res.json()) as T;
}

async function putJson(url: string, body: unknown, config: SyncConfig): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(config) },
    body: JSON.stringify(body),
  });
  await ensureOk(res, `PUT ${url}`);
}

/** WebDAV：PUT/GET + MKCOL 逐级建目录 + PROPFIND 列设备 */
export function createWebDavProvider(config: SyncConfig): SyncProvider {
  const urlFor = (deviceId: string, file: string) =>
    `${deviceBase(config, deviceId)}/${file}`;
  const devicesUrl = () =>
    `${config.endpoint.replace(/\/+$/, "")}/${SYNC_FILE_LAYOUT.devicesDir}/`;

  const ensureDirs = async (deviceId: string): Promise<void> => {
    for (const dir of [devicesUrl(), deviceBase(config, deviceId)]) {
      const res = await fetch(dir, {
        method: "MKCOL",
        headers: authHeaders(config),
      });
      // 405 = 已存在（多数服务器行为），201 = 已创建
      if (!res.ok && res.status !== 405 && res.status !== 301) {
        throw new Error(`MKCOL ${dir} 失败：HTTP ${res.status}`);
      }
    }
  };

  return {
    listDevices: async () => {
      const res = await fetch(devicesUrl(), {
        method: "PROPFIND",
        headers: { Depth: "1", ...authHeaders(config) },
      });
      if (res.status === 404) return [];
      await ensureOk(res, "PROPFIND devices");
      const xml = await res.text();
      // 最小 multistatus 解析：提取 href，取 devices/ 的直接子段
      const devices: string[] = [];
      const hrefRe = /<(?:\w+:)?href>\s*([^<]+?)\s*<\/(?:\w+:)?href>/gu;
      for (const m of xml.matchAll(hrefRe)) {
        const href = decodeURIComponent(m[1] ?? "");
        const marker = `${SYNC_FILE_LAYOUT.devicesDir}/`;
        const idx = href.lastIndexOf(marker);
        if (idx < 0) continue;
        const rest = href.slice(idx + marker.length).replace(/\/+$/, "");
        if (rest.length > 0 && !rest.includes("/")) devices.push(rest);
      }
      return [...new Set(devices)];
    },
    readManifest: async (deviceId) => {
      await ensureDirs(deviceId);
      return fetchJson<Manifest>(urlFor(deviceId, SYNC_FILE_LAYOUT.manifestFile), config);
    },
    writeManifest: async (deviceId, manifest) => {
      await ensureDirs(deviceId);
      await putJson(urlFor(deviceId, SYNC_FILE_LAYOUT.manifestFile), manifest, config);
    },
    readRecords: async (deviceId) => {
      await ensureDirs(deviceId);
      return ((await fetchJson<unknown[]>(urlFor(deviceId, SYNC_FILE_LAYOUT.recordsFile), config)) ??
        []) as TaggedRecord[];
    },
    writeRecords: async (deviceId, records) => {
      await ensureDirs(deviceId);
      await putJson(urlFor(deviceId, SYNC_FILE_LAYOUT.recordsFile), records, config);
    },
  };
}

/** 自托管 HTTP：约定 GET <base>/index → string[]，GET/PUT <base>/devices/<id>/<file> */
export function createHttpProvider(config: SyncConfig): SyncProvider {
  const urlFor = (deviceId: string, file: string) => deviceBase(config, deviceId) + "/" + file;
  return {
    listDevices: async () => {
      const list = await fetchJson<string[]>(
        config.endpoint.replace(/\/+$/, "") + "/index",
        config,
      );
      return list ?? [];
    },
    readManifest: (deviceId) =>
      fetchJson<Manifest>(urlFor(deviceId, SYNC_FILE_LAYOUT.manifestFile), config),
    writeManifest: async (deviceId, manifest) =>
      putJson(urlFor(deviceId, SYNC_FILE_LAYOUT.manifestFile), manifest, config),
    readRecords: async (deviceId) =>
      ((await fetchJson<unknown[]>(urlFor(deviceId, SYNC_FILE_LAYOUT.recordsFile), config)) ??
        []) as TaggedRecord[],
    writeRecords: async (deviceId, records) =>
      putJson(urlFor(deviceId, SYNC_FILE_LAYOUT.recordsFile), records, config),
  };
}

/** 本地文件夹同步（桌面端）：直接落在用户选择的目录内 */
export function createFolderProvider(config: SyncConfig, files: FilesPort): SyncProvider {
  const root = config.endpoint.replace(/[\\/]+$/, "");
  const join = (...parts: string[]) => [root, ...parts].join("/");
  return {
    listDevices: async () => {
      const entries = await files.listDir(join(SYNC_FILE_LAYOUT.devicesDir));
      return entries.filter((e) => !e.startsWith(".") && !e.includes("/"));
    },
    readManifest: async (deviceId) => {
      const raw = await files.readFile(
        join(SYNC_FILE_LAYOUT.devicesDir, deviceId, SYNC_FILE_LAYOUT.manifestFile),
      );
      return raw === null ? null : (JSON.parse(raw) as Manifest);
    },
    writeManifest: async (deviceId, manifest) => {
      await files.mkdir(join(SYNC_FILE_LAYOUT.devicesDir, deviceId));
      await files.writeFile(
        join(SYNC_FILE_LAYOUT.devicesDir, deviceId, SYNC_FILE_LAYOUT.manifestFile),
        JSON.stringify(manifest),
      );
    },
    readRecords: async (deviceId) => {
      const raw = await files.readFile(
        join(SYNC_FILE_LAYOUT.devicesDir, deviceId, SYNC_FILE_LAYOUT.recordsFile),
      );
      return raw === null ? [] : (JSON.parse(raw) as TaggedRecord[]);
    },
    writeRecords: async (deviceId, records) => {
      await files.mkdir(join(SYNC_FILE_LAYOUT.devicesDir, deviceId));
      await files.writeFile(
        join(SYNC_FILE_LAYOUT.devicesDir, deviceId, SYNC_FILE_LAYOUT.recordsFile),
        JSON.stringify(records),
      );
    },
  };
}

export function createProvider(config: SyncConfig, files?: FilesPort): SyncProvider {
  if (config.kind === "folder") {
    if (!files) throw new Error("文件夹同步需要 FilesPort（仅桌面端支持）");
    return createFolderProvider(config, files);
  }
  if (config.kind === "s3") {
    // S3 需要 bucket/region/credentials，由 UI 层收集后传入
    return createS3Provider({
      ...config,
      kind: "s3",
      bucket: config.bucket ?? "",
      region: config.region ?? "us-east-1",
      accessKeyId: config.accessKeyId ?? "",
      secretAccessKey: config.secretAccessKey ?? "",
    });
  }
  if (config.kind === "http") return createHttpProvider(config);
  return createWebDavProvider(config);
}

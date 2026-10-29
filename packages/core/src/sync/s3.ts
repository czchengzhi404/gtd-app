/**
 * S3 兼容存储 Provider（阿里云 OSS / 腾讯云 COS / MinIO / AWS S3 / Backblaze B2）。
 *
 * 使用 AWS Signature V4 签名，基于 Web Crypto API（crypto.subtle）——
 * 桌面渲染进程（Chromium）与 Bun 均原生支持，无需 Node crypto。
 *
 * 路径结构：{endpoint}/{bucket}/devices/{deviceId}/{manifest.json, records.json}
 * （path-style 寻址，兼容所有 S3 兼容服务）
 */
import type { Manifest, SyncProvider, SyncConfig } from "./types";
import { SYNC_FILE_LAYOUT } from "./types";
import type { FilesPort } from "../platform/ports";
import type { TaggedRecord } from "../models/commands";

export interface S3Config extends SyncConfig {
  kind: "s3";
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3ConfigInput {
  kind: "s3";
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/* ---------------- AWS SigV4 签名 ---------------- */

const encoder = new TextEncoder();
/** 兼容无 DOM lib 的环境：fetch body 类型 */
type Body = Parameters<typeof fetch>[1] extends { body?: infer B } ? B : never;

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface SigV4Result {
  authorization: string;
  amzDate: string;
  payloadHash: string;
}

/** 导出供测试使用（AWS SigV4 签名是纯计算，不含网络 IO） */
export { signRequest };

async function signRequest(
  method: string,
  url: URL,
  payload: string | Uint8Array | null,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  service = "s3",
): Promise<SigV4Result> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(payload ?? "");

  const host = url.host;
  const path = decodeURIComponent(url.pathname);
  const canonicalUri = path;

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // query string（我们不使用 S3 查询参数）
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  signingKey = await hmacSha256(signingKey, region);
  signingKey = await hmacSha256(signingKey, service);
  signingKey = await hmacSha256(signingKey, "aws4_request");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate,
    payloadHash,
  };
}

/* ---------------- Provider ---------------- */

export function createS3Provider(config: S3ConfigInput): SyncProvider {
  const base = config.endpoint.replace(/\/+$/, "");
  const bucketPath = `${base}/${config.bucket}`;

  const urlFor = (deviceId: string, file: string) =>
    `${bucketPath}/${SYNC_FILE_LAYOUT.devicesDir}/${encodeURIComponent(deviceId)}/${file}`;
  const listUrl = () => `${bucketPath}/${SYNC_FILE_LAYOUT.devicesDir}/`;

  const sign = async (method: string, url: string, payload: string | Uint8Array | null) => {
    const parsed = new URL(url);
    const keyId = config.accessKeyId ?? "";
    const secret = config.secretAccessKey ?? "";
    const region = config.region ?? "us-east-1";
    return signRequest(method, parsed, payload, keyId, secret, region);
  };

  const headers = (sig: SigV4Result): Record<string, string> => ({
    Authorization: sig.authorization,
    "x-amz-content-sha256": sig.payloadHash,
    "x-amz-date": sig.amzDate,
  });

  async function request(
    method: string,
    url: string,
    payload: string | Uint8Array | null,
  ): Promise<{ status: number; body: string }> {
    const sig = await sign(method, url, payload);
    const body = payload === null ? undefined : new Uint8Array(encoder.encode(typeof payload === "string" ? payload : "")).length > 0 && typeof payload === "string" ? payload : payload;
    const res = await fetch(url, {
      method,
      headers: {
        ...headers(sig),
        ...(payload !== null ? { "Content-Type": "application/octet-stream" } : {}),
      },
      body: (payload as unknown as Body) ?? undefined,
    });
    if (res.status !== 200 && res.status !== 404 && res.status !== 204) {
      const body = await res.text().catch(() => "");
      throw new Error(`S3 ${method} 失败: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    return { status: res.status, body: await res.text().catch(() => "") };
  }

  return {
    listDevices: async () => {
      // S3 ListObjectsV2：列出 devices/ 前缀下的对象 key，提取 deviceId
      const url = `${bucketPath}?list-type=2&prefix=${SYNC_FILE_LAYOUT.devicesDir}/&delimiter=/`;
      const sig = await sign("GET", url, null);
      const res = await fetch(url, { headers: headers(sig) });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`S3 ListObjectsV2 失败: HTTP ${res.status}`);
      const xml = await res.text();
      const devices: string[] = [];
      const prefix = `${SYNC_FILE_LAYOUT.devicesDir}/`;
      const re = /<Key>([^<]+)<\/Key>/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(xml)) !== null) {
        const key = decodeURIComponent(match[1] ?? "");
        const rest = key.startsWith(prefix) ? key.slice(prefix.length) : key;
        const deviceId = rest.split("/")[0];
        if (deviceId && !devices.includes(deviceId)) devices.push(deviceId);
      }
      return devices;
    },
    readManifest: async (deviceId) => {
      const { status, body } = await request(
        "GET",
        urlFor(deviceId, SYNC_FILE_LAYOUT.manifestFile),
        null,
      );
      return status === 404 ? null : (JSON.parse(body) as Manifest);
    },
    writeManifest: async (deviceId, manifest) => {
      const body = JSON.stringify(manifest);
      await request("PUT", urlFor(deviceId, SYNC_FILE_LAYOUT.manifestFile), body);
    },
    readRecords: async (deviceId) => {
      const { status, body } = await request(
        "GET",
        urlFor(deviceId, SYNC_FILE_LAYOUT.recordsFile),
        null,
      );
      return status === 404 ? [] : (JSON.parse(body) as TaggedRecord[]);
    },
    writeRecords: async (deviceId, records) => {
      await request("PUT", urlFor(deviceId, SYNC_FILE_LAYOUT.recordsFile), JSON.stringify(records));
    },
  };
}

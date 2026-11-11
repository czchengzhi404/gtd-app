/**
 * 本地「自托管 HTTP」同步服务端：用来实测 App 的云同步链路。
 *
 * 协议（packages/core/src/sync/providers.ts 里 createHttpProvider 的约定）：
 *   GET  <base>/index                                  → string[]   设备 id 列表
 *   GET  <base>/devices/<deviceId>/manifest.json       → Manifest | 404
 *   PUT  <base>/devices/<deviceId>/manifest.json       ← Manifest
 *   GET  <base>/devices/<deviceId>/records.json        → TaggedRecord[]
 *   PUT  <base>/devices/<deviceId>/records.json        ← TaggedRecord[]
 *
 * 安卓模拟器访问宿主机用 10.0.2.2，所以 App 里 endpoint 填 http://10.0.2.2:8787
 *
 * 用法：node bench/local-sync-server.mjs [port]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] ?? 8787);
const ROOT = "android-report/local-sync";

fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

/** 每次请求都记一行，方便验证「App 真的连上来了」 */
const logLines = [];
function log(line) {
  const stamped = `${new Date().toISOString()}  ${line}`;
  logLines.push(stamped);
  console.log(stamped);
}

function deviceDir(deviceId) {
  return path.join(ROOT, "devices", encodeURIComponent(deviceId));
}

function listDeviceIds() {
  const dir = path.join(ROOT, "devices");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => decodeURIComponent(e.name));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  log(`${req.method} ${pathname}`);

  // GET /index → 设备列表
  if (req.method === "GET" && pathname === "/index") {
    const ids = listDeviceIds();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(ids));
    return;
  }

  const match = /^\/devices\/([^/]+)\/(manifest|records)\.json$/.exec(pathname);
  if (match === null) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }

  const [, rawDeviceId, kind] = match;
  const file = path.join(deviceDir(rawDeviceId), `${kind}.json`);

  if (req.method === "GET") {
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(fs.readFileSync(file, "utf8"));
    return;
  }

  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body, "utf8");
      let summary = `${body.length} 字节`;
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) summary += `，${parsed.length} 条记录`;
        else if (parsed !== null && typeof parsed === "object") {
          const keys = Object.keys(parsed);
          summary += `，键：${keys.slice(0, 6).join(",")}`;
        }
      } catch {
        /* 非 JSON 也照样收下 */
      }
      log(`  写入 ${kind}.json：${summary}`);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end("{}");
    });
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("method not allowed");
});

server.listen(port, "0.0.0.0", () => {
  log(`本地同步服务已启动：http://127.0.0.1:${port}`);
  log(`安卓模拟器请用：http://10.0.2.2:${port}`);
  log(`数据目录：${path.resolve(ROOT)}`);
});

/* 每 2 秒把日志落盘，方便测试脚本读取 */
setInterval(() => {
  fs.writeFileSync(path.join(ROOT, "requests.log"), logLines.join("\n"), "utf8");
}, 2000).unref?.();

/**
 * 并发分段下载（HTTP Range 多连接），带跨进程续传。
 *
 * 单个连接被限速时（GitHub release CDN 在国内常见），把文件切成 N 段并发拉，
 * 总吞吐通常能到单线程的数倍。最后按段合并并校验字节数 / sha256。
 *
 * 为什么分段要落盘：这条链路（ghproxy 镜像）会在收尾阶段随机 RST，
 * 一次跑完常常差最后几 MB。段文件留在磁盘上，重跑时已完成段直接跳过。
 *
 * 用法：node scripts/fetch-parallel.mjs <url> <outPath> <expectedBytes> [sha256] [segments]
 */
import fs from "node:fs";
import https from "node:https";
import crypto from "node:crypto";

const [url, outPath, expectedRaw, expectedSha, segmentsRaw] = process.argv.slice(2);
if (!url || !outPath || !expectedRaw) {
  console.error("usage: node fetch-parallel.mjs <url> <outPath> <expectedBytes> [sha256] [segments]");
  process.exit(1);
}
const expected = Number(expectedRaw);
const SEGMENTS = Number(segmentsRaw ?? 8);

function request(target, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(target, { timeout: 60_000, headers: { "User-Agent": "gtd-fetch", ...headers } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve({ redirect: res.headers.location });
        return;
      }
      resolve({ res });
    });
    // 连接被对端 RST 时，错误先落在 socket 上；没有监听器会变成未捕获异常直接杀进程。
    req.on("socket", (socket) => socket.on("error", () => undefined));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function resolveUrl(target) {
  let current = target;
  for (let i = 0; i < 5; i += 1) {
    const result = await request(current, { Range: "bytes=0-0" });
    if (result.redirect) {
      current = new URL(result.redirect, current).toString();
      continue;
    }
    result.res.resume();
    return current;
  }
  throw new Error("too many redirects");
}

function fetchRange(target, start, end) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      target,
      { timeout: 120_000, headers: { Range: `bytes=${start}-${end}`, "User-Agent": "gtd-fetch" } },
      (res) => {
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${start}-${end}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("aborted", () => reject(new Error("socket aborted")));
        res.on("error", reject);
      },
    );
    req.on("socket", (socket) => socket.on("error", () => undefined));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function fetchRangeWithRetry(target, start, end, tries = 6) {
  const want = end - start + 1;
  let lastError;
  for (let i = 0; i < tries; i += 1) {
    try {
      const buffer = await fetchRange(target, start, end);
      if (buffer.length !== want) throw new Error(`short read ${buffer.length}/${want}`);
      return buffer;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1200 * (i + 1)));
    }
  }
  throw lastError;
}

const resolved = await resolveUrl(url);
console.log("resolved:", resolved.slice(0, 80));

const size = expected;
const chunk = Math.floor(size / SEGMENTS);
const ranges = [];
for (let i = 0; i < SEGMENTS; i += 1) {
  const start = i * chunk;
  const end = i === SEGMENTS - 1 ? size - 1 : (i + 1) * chunk - 1;
  ranges.push({ start, end });
}

const segPath = (index) => `${outPath}.seg${index}`;

async function getSegment(index) {
  const { start, end } = ranges[index];
  const want = end - start + 1;
  const file = segPath(index);
  if (fs.existsSync(file)) {
    const have = fs.statSync(file).size;
    if (have === want) {
      console.log(`  段 ${index + 1}/${SEGMENTS} 已存在，跳过`);
      return fs.readFileSync(file);
    }
    fs.rmSync(file, { force: true });
  }
  const buffer = await fetchRangeWithRetry(resolved, start, end);
  fs.writeFileSync(file, buffer);
  console.log(`  段 ${index + 1}/${SEGMENTS} 完成 ${(buffer.length / 1e6).toFixed(1)}MB`, "→", file);
  return buffer;
}

// 顺序拉取而不是 Promise.all：RST 多发生在并发打满时，串行反而更容易一次跑完。
// 已经存在的段会被跳过，所以重跑的成本只有剩下那几段。
const buffers = [];
for (let i = 0; i < SEGMENTS; i += 1) buffers.push(await getSegment(i));

const merged = Buffer.concat(buffers);
if (merged.length !== size) {
  console.error(`大小不符：${merged.length} != ${size}`);
  process.exit(1);
}
fs.writeFileSync(outPath, merged);
for (let i = 0; i < SEGMENTS; i += 1) fs.rmSync(segPath(i), { force: true });
console.log("wrote", merged.length, "→", outPath);

if (expectedSha) {
  const hash = crypto.createHash("sha256").update(merged).digest("hex");
  console.log("sha256:", hash);
  if (hash !== expectedSha) {
    console.error("sha256 不符");
    process.exit(1);
  }
  console.log("校验通过");
}

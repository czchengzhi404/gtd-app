/**
 * 并发分段下载（HTTP Range 多连接），带跨进程 + 段内双重续传。
 *
 * 为什么需要这个脚本：GitHub release 的直链在国内单连接被限速到几百 KB/s，
 * 56MB 的包要跑半小时以上，而且 ghproxy 这类镜像会在收尾阶段随机 RST。
 *
 * 两个设计点都是被这条链路逼出来的：
 * 1. **并发**：单连接被限速时，N 条连接的总吞吐是单线程的数倍。
 * 2. **段内续传**：每次请求把已收到的字节 append 到 `<out>.segN`，重跑时从
 *    `start + 已收到字节数` 继续。RST 只能让进度变慢，不会让它归零。
 *
 * 用法：node scripts/fetch-parallel.mjs <url> <outPath> <expectedBytes> [sha256] [concurrency]
 */
import fs from "node:fs";
import https from "node:https";
import crypto from "node:crypto";

const [url, outPath, expectedRaw, expectedSha, concurrencyRaw] = process.argv.slice(2);
if (!url || !outPath || !expectedRaw) {
  console.error("usage: node scripts/fetch-parallel.mjs <url> <outPath> <expectedBytes> [sha256] [concurrency]");
  process.exit(1);
}
const expected = Number(expectedRaw);
const CONCURRENCY = Math.max(1, Number(concurrencyRaw ?? 6));

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
    // 对端 RST 时错误先落在 socket 上；没有监听器会变成未捕获异常直接杀掉进程，
    // 把已经下好的段全部作废。
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

/** 拉取 [start,end] 并追加进 fd；返回本次收到的字节数。失败抛出，但已写入的部分保留。 */
function fetchRangeInto(target, fd, start, end) {
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
        let got = 0;
        res.on("data", (chunk) => {
          got += chunk.length;
          fs.writeSync(fd, chunk);
        });
        res.on("end", () => resolve(got));
        res.on("aborted", () => reject(new Error("socket aborted")));
        res.on("error", reject);
      },
    );
    req.on("socket", (socket) => socket.on("error", () => undefined));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** 反复续传直到这一段收满。每轮失败都保留进度，只剩没拿到的尾段。 */
async function ensureSegment(target, index, start, end) {
  const want = end - start + 1;
  const file = `${outPath}.seg${index}`;

  let attempt = 0;
  for (;;) {
    // 每轮都以磁盘实际长度为准，而不是内存里的计数。
    // 请求被 RST 时数据可能已经写进文件但没能计入计数；如果还按旧计数从更早的
    // 偏移续传，文件会被写进重叠数据、长度与实际进度脱钩。以磁盘为准才自洽。
    let have = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (have > want) {
      fs.truncateSync(file, want);
      have = want;
    }
    if (have === want) {
      console.log(`  段 ${index} 完成 ${(want / 1e6).toFixed(1)}MB`);
      return;
    }

    attempt += 1;
    if (attempt > 200) throw new Error(`段 ${index} 重试 ${attempt} 次仍未收满（${have}/${want}）`);

    const fd = fs.openSync(file, have === 0 ? "w" : "a");
    try {
      const got = await fetchRangeInto(target, fd, start + have, end);
      if (got === 0) throw new Error("zero-length response");
    } catch (error) {
      if (attempt % 5 === 0) {
        const now = fs.existsSync(file) ? fs.statSync(file).size : 0;
        console.log(
          `  段 ${index} 第 ${attempt} 次重试（${(now / 1e6).toFixed(1)}/${(want / 1e6).toFixed(1)}MB）: ${error.message}`,
        );
      }
      const penalty = Math.min(5000, 400 * attempt);
      await new Promise((resolve) => setTimeout(resolve, penalty));
    } finally {
      fs.closeSync(fd);
    }
  }
}

const resolved = await resolveUrl(url);
console.log("resolved:", resolved.slice(0, 80));
console.log(`分 ${CONCURRENCY} 段并发，目标 ${(expected / 1e6).toFixed(1)}MB`);

const per = Math.ceil(expected / CONCURRENCY);
const segments = [];
for (let i = 0; i < CONCURRENCY; i += 1) {
  const start = i * per;
  if (start >= expected) break;
  segments.push({ index: i, start, end: Math.min(expected - 1, start + per - 1) });
}

// 有界并发：一条连接被 RST 时其他段不受影响，整体吞吐仍接近 N 倍。
let cursor = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, segments.length) }, async () => {
  while (cursor < segments.length) {
    const segment = segments[cursor];
    cursor += 1;
    await ensureSegment(resolved, segment.index, segment.start, segment.end);
  }
});
await Promise.all(workers);

// 按序合并
const parts = [];
for (const segment of segments) {
  parts.push(fs.readFileSync(`${outPath}.seg${segment.index}`));
}
const merged = Buffer.concat(parts);
if (merged.length !== expected) {
  console.error(`大小不符：${merged.length} != ${expected}`);
  process.exit(1);
}
fs.writeFileSync(outPath, merged);
for (const segment of segments) fs.rmSync(`${outPath}.seg${segment.index}`, { force: true });
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

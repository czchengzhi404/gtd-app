/**
 * 断点续传下载脚本（GitHub release 资产专用）。
 *
 * 为什么需要：大文件直连经常在中途卡死/超时（本项目实测 59MB 的 APK 多次中断）。
 * 这里用 Range 请求从当前文件末尾继续，配合超时重试，直到字节数达到预期。
 *
 * 用法：node scripts/fetch-asset.mjs <url> <outPath> <expectedBytes> [sha256]
 */
import fs from "node:fs";
import https from "node:https";
import crypto from "node:crypto";

const [url, outPath, expectedRaw, expectedSha] = process.argv.slice(2);
if (!url || !outPath || !expectedRaw) {
  console.error("usage: node fetch-asset.mjs <url> <outPath> <expectedBytes> [sha256]");
  process.exit(1);
}
const expected = Number(expectedRaw);

function head(urlToCheck) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlToCheck, { timeout: 30_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve({ redirect: res.headers.location });
        return;
      }
      res.resume();
      resolve({ size: Number(res.headers["content-length"] ?? 0) });
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

function download(from, to, start) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      from,
      { timeout: 60_000, headers: { Range: `bytes=${start}-`, "User-Agent": "gtd-fetch" } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          resolve({ redirect: res.headers.location });
          return;
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const out = fs.createWriteStream(to, { flags: "a" });
        let written = start;
        res.on("data", (chunk) => {
          written += chunk.length;
        });
        res.pipe(out);
        out.on("finish", () => resolve({ written }));
        out.on("error", reject);
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
    });
    request.on("error", reject);
  });
}

let currentUrl = url;
let guard = 0;

while (guard < 200) {
  guard += 1;
  const size = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
  if (size >= expected) break;

  try {
    const result = await download(currentUrl, outPath, size);
    if (result.redirect) {
      currentUrl = new URL(result.redirect, currentUrl).toString();
      continue;
    }
    console.log(`  ${(result.written / 1e6).toFixed(1)} / ${(expected / 1e6).toFixed(1)} MB`);
  } catch (error) {
    console.log(`  中断（${error instanceof Error ? error.message : String(error)}），重试…`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // 某些 CDN 分片地址会过期，回到原始 URL
    currentUrl = url;
  }
}

const finalSize = fs.statSync(outPath).size;
console.log(`完成：${finalSize} 字节（预期 ${expected}）`);
if (finalSize !== expected) {
  console.error("大小不匹配");
  process.exit(1);
}

if (expectedSha) {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(outPath)).digest("hex");
  console.log(`sha256: ${hash}`);
  if (hash !== expectedSha) {
    console.error("sha256 不匹配");
    process.exit(1);
  }
  console.log("校验通过");
}

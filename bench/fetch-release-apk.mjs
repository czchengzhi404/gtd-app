import { execFileSync } from "node:child_process";
import fs from "node:fs";

/**
 * 等某个 tag 的 APK 出现在 GitHub Release 上，然后交给 fetch-parallel.mjs 下载并校验。
 *
 * 用法：node bench/fetch-release-apk.mjs <tag> <arch> <outPath> [timeoutMinutes]
 *   arch: arm64 | x86_64 | universal | armeabi-v7a
 *
 * 为什么要等：CI 各平台并行，Android 通常 15~20 分钟才把 APK 传上去；
 * 直接开下载会 404。这里先轮询资产清单，拿到 size + sha256 digest 再下。
 */
const [tag, arch, outPath, timeoutRaw] = process.argv.slice(2);
if (!tag || !arch || !outPath) {
  console.error("usage: node bench/fetch-release-apk.mjs <tag> <arch> <outPath> [timeoutMinutes]");
  process.exit(1);
}
const timeoutMs = Number(timeoutRaw ?? 60) * 60_000;

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

const want = `GTD-${tag}-${arch}.apk`;

function findAsset() {
  try {
    const json = gh([
      "api",
      "repos/czchengzhi404/gtd-app/releases",
      "--jq",
      `.[] | select(.tag_name=="${tag}") | .assets[] | select(.name=="${want}") | {name, size, digest, url: .url}`,
    ]);
    if (json.length === 0) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const deadline = Date.now() + timeoutMs;
let asset = null;
while (Date.now() < deadline) {
  asset = findAsset();
  if (asset !== null && asset.size > 0) break;
  console.log("等待 CI 上传", want, "...");
  await new Promise((r) => setTimeout(r, 20_000));
}

if (asset === null || !asset.size) {
  console.error("超时：没等到", want);
  process.exit(1);
}

const sha = (asset.digest ?? "").replace(/^sha256:/, "");
console.log(`找到 ${asset.name}  size=${asset.size}  sha256=${sha || "(无)"}`);

const url = `https://ghproxy.net/https://github.com/czchengzhi404/gtd-app/releases/download/${tag}/${want}`;
const args = ["scripts/fetch-parallel.mjs", url, outPath, String(asset.size)];
if (sha) args.push(sha);
args.push("6");

execFileSync("node", args, { stdio: "inherit", cwd: process.cwd() });
console.log("下载完成:", outPath);

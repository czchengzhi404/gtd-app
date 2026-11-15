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
 *
 * 为什么还要转正：CI 是先建 draft release 再往里传产物，传完**不会自动转正**
 * （实测 v2.7.5 / v2.7.6 都留在 draft）。草稿的资产对外一律 404，
 * 镜像和直链都一样。所以拿到资产清单后先 --draft=false，再下载。
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

// 草稿状态下的资产对外 404 —— 先转正再下载
try {
  const draft = gh([
    "api",
    `repos/czchengzhi404/gtd-app/releases`,
    "--jq",
    `.[] | select(.tag_name=="${tag}") | .draft`,
  ]);
  if (draft === "true") {
    gh(["release", "edit", tag, "-R", "czchengzhi404/gtd-app", "--draft=false"]);
    console.log("release 原本是 draft，已转正");
    await new Promise((r) => setTimeout(r, 3000));
  }
} catch (error) {
  console.log("转正检查失败（继续尝试下载）:", String(error.message).slice(0, 80));
}

const githubUrl = `https://github.com/czchengzhi404/gtd-app/releases/download/${tag}/${want}`;
// 镜像按顺序试：ghproxy.net 在 2026-11-08 对 Range 请求大面积 502，
// gh-proxy.com / ghfast.top 当时可用。任何一个能下完就行（最后按官方 sha256 校验）。
const mirrors = [
  (u) => `https://gh-proxy.com/${u}`,
  (u) => `https://ghfast.top/${u}`,
  (u) => `https://ghproxy.net/${u}`,
];

let lastError;
for (const make of mirrors) {
  const url = make(githubUrl);
  console.log("尝试镜像:", new URL(url).host);
  const args = ["scripts/fetch-parallel.mjs", url, outPath, String(asset.size)];
  if (sha) args.push(sha);
  args.push("6");
  try {
    execFileSync("node", args, { stdio: "inherit", cwd: process.cwd() });
    console.log("下载完成:", outPath);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log("该镜像失败，换下一个");
    const { rmSync, existsSync } = await import("node:fs");
    for (let i = 0; i < 6; i += 1) {
      const part = `${outPath}.seg${i}`;
      if (existsSync(part)) rmSync(part, { force: true });
    }
  }
}

console.error("所有镜像都失败:", lastError?.message ?? "");
process.exit(1);

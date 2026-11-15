/**
 * 全量审计：源码树里所有受版本控制的文本文件，与远端 main 是否一致。
 * 目的：v2.7.18 起有 10 个 core 文件漏推，必须确认没有别的漏网之鱼。
 *
 * 用法：node bench/audit-full-parity.mjs [限制条数]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "czchengzhi404/gtd-app";
const LIMIT = Number(process.argv[2] ?? 400);

// 从发布树的 git 索引拿「应该受版本控制」的文件清单（排除生成物/报告/二进制）
const publishDir = process.env.TEMP + "\\gtd-publish";
const tracked = execFileSync("git", ["ls-files"], { cwd: publishDir, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((p) => !/\.(png|jpg|jpeg|webp|wav|ico|apk|exe|zip|pdf)$/i.test(p))
  .filter((p) => !/^android-report\//.test(p));

function remoteText(file) {
  const b64 = execFileSync("gh", ["api", `repos/${REPO}/contents/${file}`, "--jq", ".content"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).replace(/\s/g, "");
  return Buffer.from(b64, "base64").toString("utf8");
}

const diffs = [];
let checked = 0;
for (const file of tracked.slice(0, LIMIT)) {
  const localPath = path.join(process.cwd(), file);
  if (!fs.existsSync(localPath)) continue;
  let remote;
  try {
    remote = remoteText(file);
  } catch {
    diffs.push({ file, why: "远端缺文件" });
    continue;
  }
  const local = fs.readFileSync(localPath, "utf8");
  checked += 1;
  if (local !== remote) diffs.push({ file, why: `内容不同 local=${local.length} remote=${remote.length}` });
}

console.log(`检查 ${checked} 个文件，差异 ${diffs.length} 个`);
for (const d of diffs) console.log(`  ❌ ${d.file}  ${d.why}`);
if (diffs.length === 0) console.log("✅ 源码树与远端 main 完全一致");

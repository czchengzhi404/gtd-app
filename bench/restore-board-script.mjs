/**
 * 从发布仓库的已提交版本取回干净的 render-session-board.py。
 * 直接用 PowerShell 重定向会改编码，所以走 node 的 Buffer。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const publishDir = process.env.TEMP + "\\gtd-publish";
const raw = execFileSync("git", ["show", "HEAD:bench/render-session-board.py"], {
  cwd: publishDir,
  encoding: "buffer",
  maxBuffer: 32 * 1024 * 1024,
});
fs.writeFileSync("bench/render-session-board.py", raw);
console.log("restored", raw.length, "bytes");

const text = raw.toString("utf8");
console.log("has 版本时间线:", text.includes("版本时间线"));
console.log("versions:", (text.match(/\(\"v2\.7\./g) ?? []).length);
const privateUse = (text.match(/[\uE000-\uF8FF]/g) ?? []).length;
console.log("private-use chars:", privateUse);

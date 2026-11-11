/**
 * 从落盘的 HTML 里把 WebSocket 连接地址和协议格式挖出来。
 * 用法：node bench/find-websocket-url.mjs
 */
import fs from "node:fs";

const html = fs.readFileSync("android-report/onlinelist-raw.html", "utf8");

const patterns = [
  /new\s+WebSocket\s*\(([\s\S]{0,200}?)\)/g,
  /wss?:\/\/[^\s"'`,;)]+/g,
  /["'`](\/ws[^"'`]*)["'`]/g,
  /WebSocket[^\n]{0,160}/g,
  /onmessage[^\n]{0,160}/g,
  /ws\.(send|onopen|onclose)[^\n]{0,120}/g,
];

const seen = new Set();
for (const re of patterns) {
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[0].replace(/\s+/g, " ").trim().slice(0, 200);
    if (seen.has(text)) continue;
    seen.add(text);
    console.log("•", text);
  }
}

console.log("\n=== 协议相关的常量/函数（含 send 的地方）===");
const lines = html.split("\n");
lines.forEach((line, i) => {
  if (/\bws\b|WebSocket|onmessage|\.send\(/.test(line)) {
    console.log(`${i + 1}: ${line.trim().slice(0, 220)}`);
  }
});

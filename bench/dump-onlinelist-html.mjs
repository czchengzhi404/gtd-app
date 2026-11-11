/**
 * 抓分享页原始 HTML 存盘，并把可疑线索全打出来。
 *
 * 修掉上一次的 bug：`//host/path` 是**协议相对** URL，
 * 上次直接拼在 origin 后面变成了 https://onlinelistmaker.com//host/path，自然是 404。
 *
 * 用法：node bench/dump-onlinelist-html.mjs [listId]
 */
import fs from "node:fs";

const listId = process.argv[2] ?? "IfhTbvvgQfR5mvqd";
const origin = "https://onlinelistmaker.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; gtd-import-probe)" };

/** 协议相对 / 绝对 / 相对路径 → 绝对 URL */
function absolutize(src) {
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `${origin}${src}`;
  return `${origin}/${src}`;
}

const res = await fetch(`${origin}/${listId}`, { headers: HEADERS });
const html = await res.text();

fs.mkdirSync("android-report", { recursive: true });
fs.writeFileSync("android-report/onlinelist-raw.html", html, "utf8");
console.log(`HTTP ${res.status}  ${html.length} 字节 → android-report/onlinelist-raw.html`);

console.log("\n=== 所有 <script> ===");
for (const m of html.matchAll(/<script([^>]*)>/gi)) {
  const attrs = m[1];
  const src = /src=["']([^"']+)["']/i.exec(attrs)?.[1];
  console.log(src === undefined ? "  [inline]" : `  ${absolutize(src)}`);
}

console.log("\n=== 内联脚本长度 ===");
let totalInline = 0;
for (const m of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)) {
  totalInline += m[1].length;
  console.log(`  ${m[1].length} 字节: ${m[1].trim().slice(0, 120).replace(/\s+/g, " ")}`);
}
console.log(`  合计 ${totalInline} 字节`);

console.log("\n=== 可疑线索 ===");
const hints = [
  "ws://", "wss://", "socket.io", "websocket", "supabase", "firebase", "firestore",
  "appwrite", "pocketbase", "liveblocks", "ably", "pusher", "/api/", "fetch(", "axios",
  "XMLHttpRequest", "EventSource", "indexedDB", "localStorage", "listId", "list_id",
];
const lower = html.toLowerCase();
for (const h of hints) {
  const idx = lower.indexOf(h.toLowerCase());
  if (idx >= 0) {
    console.log(`  ${h}: …${html.slice(Math.max(0, idx - 80), idx + 140).replace(/\s+/g, " ")}…`);
  }
}

console.log("\n=== <meta> 与 data-* 属性 ===");
for (const m of html.matchAll(/<meta[^>]*>/gi)) console.log("  " + m[0].slice(0, 160));
for (const m of html.matchAll(/\sdata-[a-z0-9-]+=["'][^"']*["']/gi)) console.log("  " + m[0].slice(0, 160));

/**
 * 实测 onlinelistmaker 的 WebSocket：连上后只收不发，把首条消息打出来。
 *
 * 协议（从站点自己的前端代码里读出来的）：
 *   const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
 *   new WebSocket(protocol + '//' + location.host + '/' + LIST_ID + '/ws')
 * 首条消息是 { type: 'init', items, name, settings }。
 *
 * 只读：连上、收一条、关闭。不发任何 add/toggle/delete。
 *
 * 用法：node bench/probe-onlinelist-ws.mjs [listId]
 */
import fs from "node:fs";

const listId = process.argv[2] ?? "IfhTbvvgQfR5mvqd";
const url = `wss://onlinelistmaker.com/${listId}/ws`;

console.log("连接:", url);

const ws = new WebSocket(url);
let done = false;

const finish = (code) => {
  if (done) return;
  done = true;
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(code), 200);
};

const timer = setTimeout(() => {
  console.error("超时：10 秒内没收到消息");
  finish(1);
}, 10_000);

ws.addEventListener("open", () => {
  console.log("已连接，等待首条消息…");
});

ws.addEventListener("message", (event) => {
  clearTimeout(timer);
  const raw = typeof event.data === "string" ? event.data : "(binary)";
  console.log(`收到 ${raw.length} 字符`);
  try {
    const parsed = JSON.parse(raw);
    console.log("type:", parsed.type);
    console.log("name:", parsed.name);
    console.log("settings:", JSON.stringify(parsed.settings));
    console.log("items:", Array.isArray(parsed.items) ? parsed.items.length : "(无)");
    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      console.log("前 3 条:");
      for (const item of parsed.items.slice(0, 3)) console.log("  ", JSON.stringify(item));
    }
    // 存下来给后续转换器当样本
    fs.mkdirSync("android-report", { recursive: true });
    fs.writeFileSync("android-report/onlinelist-ws-init.json", JSON.stringify(parsed, null, 2), "utf8");
    console.log("\n已存 android-report/onlinelist-ws-init.json");
  } catch (error) {
    console.error("不是 JSON:", error.message);
    console.log(raw.slice(0, 300));
  }
  finish(0);
});

ws.addEventListener("error", (event) => {
  clearTimeout(timer);
  console.error("连接错误:", event.message ?? event.type ?? "unknown");
  finish(1);
});

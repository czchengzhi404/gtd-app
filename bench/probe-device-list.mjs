/**
 * 看同步页的设备列表是否列出了已同步的设备（服务端此时应有 1 台）。
 * 用法：node bench/probe-device-list.mjs
 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://sync" ${PKG}`]);
await sleep(3000);

// 滚到底部找设备区块
for (let i = 0; i < 6; i += 1) {
  if (texts().some((t) => /Devices|设备/i.test(t))) break;
  adb(["shell", "input swipe 540 1900 540 900 300"]);
  await sleep(700);
}
await sleep(2000);

console.log("=== 同步页（滚到底后）===");
console.log(texts().join(" | ").slice(0, 800));

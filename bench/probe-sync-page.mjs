/**
 * 探查同步页控件，为「实际连接 / 设备列表 / 自动同步」的实测做准备。
 * 用法：node bench/probe-sync-page.mjs
 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://sync" ${PKG}`]);
await sleep(2800);

console.log("=== 同步页节点 ===");
for (const n of nodes()) {
  const t = (n.text || "").trim();
  const d = (n.desc || "").trim();
  console.log(`  y=${String(n.cy).padStart(4)} x=${String(n.cx).padStart(4)} text=${JSON.stringify(t.slice(0, 40))} desc=${JSON.stringify(d.slice(0, 30))}`);
}

/**
 * 探查收件箱顶部控件：语法速查（?）、筛选（漏斗）、情境 chip 的实际标签与坐标。
 * 用法：node bench/probe-inbox-controls.mjs
 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);

console.log("=== 收件箱顶部节点（y < 1200）===");
for (const n of nodes()) {
  if (n.cy <= 1200) {
    console.log(
      `  y=${String(n.cy).padStart(4)} x=${String(n.cx).padStart(4)}  text=${JSON.stringify((n.text || "").slice(0, 34))}  desc=${JSON.stringify((n.desc || "").slice(0, 34))}`,
    );
  }
}

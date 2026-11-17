/** 清掉系统通知栏里本 App 的残留通知（旧通知会污染后续验证）。 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";

function countAppNotifications() {
  let raw = "";
  try {
    raw = adb(["shell", "dumpsys notification --noredact"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    raw = (e.stdout ?? "").toString();
  }
  return (raw.match(/app\.gtd\.local/g) ?? []).length;
}

console.log("清前:", countAppNotifications(), "处");

// 展开通知栏，点 Clear all
adb(["shell", "cmd statusbar expand-notifications"]);
await sleep(2000);

const nodes = parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const clearAll = nodes.find((n) => /^(Clear all|全部清除)$/i.test((n.text || "").trim()));
if (clearAll !== undefined) {
  console.log("点 Clear all @", clearAll.cx, clearAll.cy);
  adb(["shell", `input tap ${clearAll.cx} ${clearAll.cy}`]);
  await sleep(1800);
} else {
  console.log("没找到 Clear all，尝试逐条划掉");
  // 从上往下逐条划掉
  for (let i = 0; i < 6; i += 1) {
    adb(["shell", "input swipe 540 500 1000 500 250"]);
    await sleep(700);
  }
}
adb(["shell", "cmd statusbar collapse"]);
await sleep(800);

console.log("清后:", countAppNotifications(), "处");
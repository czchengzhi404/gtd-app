/**
 * 定点探查：任务详情页 ACTIONS 那一行到底有哪些按钮。
 * 「导出正文」的渲染条件是 onExportNotes 有值 且 task.notes 非空，
 * 现在正文已经有内容了，按钮理应出现。
 *
 * 用法：node bench/probe-detail-actions.mjs [任务标题片段]
 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const titleHint = process.argv[2] ?? "回复客户邮件";

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);

const row = nodes().find((n) => (n.text || "").includes(titleHint));
if (row === undefined) {
  console.log("找不到任务:", titleHint);
  console.log("收件箱:", texts().slice(0, 12).join(" | "));
  process.exit(1);
}
adb(["shell", `input tap 800 ${row.cy}`]);
await sleep(2800);

// 滚到 ACTIONS 附近
for (let i = 0; i < 8; i += 1) {
  if (texts().some((t) => /Save as template|存为模板/i.test(t))) break;
  adb(["shell", "input swipe 540 1800 540 900 300"]);
  await sleep(700);
}

console.log("=== ACTIONS 附近全部文本 ===");
for (const n of nodes()) {
  if (n.cy > 900 && n.cy < 2000) {
    console.log(`  y=${n.cy}  ${JSON.stringify((n.text || "").slice(0, 40))}  desc=${JSON.stringify((n.desc || "").slice(0, 30))}`);
  }
}

const all = texts();
console.log("\n=== 关键按钮存在性 ===");
for (const label of ["Save as template", "Version history", "Export note", "导出正文", "存为模板", "版本历史"]) {
  console.log(`  ${all.includes(label) ? "有" : "无"}  ${label}`);
}

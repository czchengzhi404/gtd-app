/** 手动重演：打开前置面板 → 点 Alpha → dump 结果。 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

console.log("当前页:", texts().slice(0, 12).join(" | "));

// 找 Add prerequisite 按钮并点
const addBtn = nodes().find((n) => /Add prerequisite|添加前置/.test((n.text || "") + (n.desc || "")));
if (addBtn === undefined) {
  console.log("找不到 Add prerequisite 按钮");
  process.exit(1);
}
console.log("点按钮:", addBtn.cx, addBtn.cy);
adb(["shell", `input tap ${addBtn.cx} ${addBtn.cy}`]);
await sleep(1800);

const sheet = nodes().filter((n) => n.cy > 1300);
console.log("面板节点:");
for (const n of sheet) console.log(`  cx=${n.cx} cy=${n.cy} text=${JSON.stringify((n.text || "").trim())}`);

const alpha = sheet.find((n) => (n.text || "").trim() === "整理桌面");
if (alpha === undefined) {
  console.log("面板里没有 Alpha");
  process.exit(1);
}
console.log("点 整理桌面:", alpha.cx, alpha.cy);
adb(["shell", `input tap ${alpha.cx} ${alpha.cy}`]);
await sleep(2800);

console.log("点后页面:", texts().slice(0, 20).join(" | "));

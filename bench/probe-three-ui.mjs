/**
 * 探查三个尚未验证功能的真实形态：
 *   1. 保存的筛选（视角）—— 筛选面板里带条件时，保存控件长什么样
 *   2. 拖拽排序 —— "Drag to reorder" 进入什么模式
 *   3. 项目内分区 —— 项目页哪里能建分区
 *
 * 用法：node bench/probe-three-ui.mjs
 */
import { adb, dumpUi, parseNodes, sleep, back } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

const dumpAll = (title) => {
  console.log(`\n=== ${title} ===`);
  for (const n of nodes()) {
    const t = (n.text || "").trim();
    const d = (n.desc || "").trim();
    if (t.length === 0 && d.length === 0) continue;
    console.log(`  y=${String(n.cy).padStart(4)} x=${String(n.cx).padStart(4)} text=${JSON.stringify(t.slice(0, 30))} desc=${JSON.stringify(d.slice(0, 30))}`);
  }
};

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);

/* 1. 带条件打开筛选面板 */
await tapLabel("Filters");
await sleep(1200);
await tapLabel("Overdue only");
await sleep(1500);
dumpAll("筛选面板（Overdue only 已选）");

/* 关掉 */
await back();
await sleep(1200);
await tapLabel("Filters");
await sleep(1000);
await tapLabel("Overdue only");
await sleep(1000);
await back();
await sleep(1200);

/* 2. 重排模式 */
console.log("\n--- 点 Drag to reorder ---");
await tapLabel("Drag to reorder");
await sleep(1800);
dumpAll("重排模式");

await back();
await sleep(1000);

/* 3. 项目页分区入口 */
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(2200);
await tapLabel("装修");
await sleep(2200);
dumpAll("项目详情（找分区入口）");

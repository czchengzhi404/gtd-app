/**
 * 补验：保存的筛选（视角）+ 拖拽排序。
 *
 * 控件（从 dump 读出来的）：
 *   筛选面板选条件后出现 `Save current filter` → 弹 `Filter name` 输入框（Cancel / Save）
 *   点标题栏 `Drag to reorder` 进入重排模式，每行左侧出现 `Drag to reorder` 手柄
 *
 * 踩过的坑：
 *   - ESC(keyevent 111) 会把**命名弹窗**当成取消关掉，所以弹窗里不能用 ESC 收键盘，
 *     直接点 Save 即可（对话框浮在键盘上方）。
 *   - 测拖拽前必须先把筛选清空，否则列表是空的（0 found），没有可拖的行。
 *
 * 用法：node scripts/verify-perspective-reorder.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/perspective-reorder";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

const rowOrder = () =>
  nodes()
    .filter((n) => /^Open task: /.test(n.desc || ""))
    .sort((a, b) => a.cy - b.cy)
    .map((n) => (n.desc || "").replace("Open task: ", "").trim());

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);

/* ================= 1. 保存的筛选（视角） ================= */
const NAME = "overdueonly";

record("打开筛选面板", await tapLabel("Filters"));
await sleep(1200);
record("选一个条件（Overdue only）", await tapLabel("Overdue only"));
await sleep(1500);
shot("1-filter-with-save");
record("面板出现「Save current filter」", texts().some((t) => /Save current filter/i.test(t)), "");

record("点「Save current filter」", await tapLabel("Save current filter"));
await sleep(1500);
shot("2-save-prompt");
const promptTexts = texts();
record("弹出 `Filter name` 命名框", promptTexts.some((t) => /Filter name/i.test(t)), promptTexts.slice(0, 10).join(" | "));

// 直接输入（不要按 ESC：那会取消弹窗）
adb(["shell", `input text "${NAME}"`]);
await sleep(1200);
shot("3-named");

const confirmed = (await tapLabel("Save")) || (await tapLabel("保存"));
record("确认保存视角", confirmed, texts().slice(0, 10).join(" | "));
await sleep(2200);
shot("4-saved-perspective");

// 面板里应出现刚存的视角
await back();
await sleep(1200);
record("重新打开筛选面板", await tapLabel("Filters"));
await sleep(1500);
shot("5-perspective-list");
const listTexts = texts();
record("视角以 chip 形式出现在面板里", listTexts.some((t) => t.includes(NAME)), listTexts.slice(0, 14).join(" | "));

/* 清空筛选，准备拖拽测试 */
await tapLabel("Overdue only");
await sleep(1200);
await back();
await sleep(1500);
shot("5b-cleared");

/* ================= 2. 拖拽排序 ================= */
const beforeOrder = rowOrder();
console.log("  拖拽前顺序:", beforeOrder.join(" → "));
record("收件箱有可拖拽的任务行", beforeOrder.length >= 2, `${beforeOrder.length} 行`);

record("点标题栏「Drag to reorder」进入重排", await tapLabel("Drag to reorder"));
await sleep(2000);
shot("6-reorder-mode");

const handles = nodes()
  .filter((n) => (n.desc || "").trim() === "Drag to reorder")
  .sort((a, b) => a.cy - b.cy);
record("每行出现拖拽手柄", handles.length >= 3, `共 ${handles.length} 个手柄（含标题栏 1 个）`);

const rowHandles = handles.filter((n) => n.cy > 400);
if (rowHandles.length >= 2) {
  // 把第一行拖到第二行下方
  adb(["shell", `input swipe ${rowHandles[0].cx} ${rowHandles[0].cy} ${rowHandles[0].cx} ${rowHandles[1].cy + 140} 800`]);
  await sleep(2600);
  shot("7-after-drag");

  const afterOrder = rowOrder();
  console.log("  拖拽后顺序:", afterOrder.join(" → "));
  record(
    "顺序发生变化",
    afterOrder.length >= 2 && afterOrder[0] !== beforeOrder[0],
    `${beforeOrder.slice(0, 2).join(" , ")} → ${afterOrder.slice(0, 2).join(" , ")}`,
  );
} else {
  record("顺序发生变化", false, "没有找到行手柄");
}

console.log(`\n截图目录: ${shotDir}`);
summary();

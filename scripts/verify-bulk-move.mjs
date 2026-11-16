/**
 * 端到端验证 OptionSheet 的批量回调（此前只验过「入口能点开」）。
 *
 * 关键：用 `input motionevent DOWN ... / UP ...` 精确模拟长按，
 * 而不是 `input swipe x y x y 800`——后者在模拟器上会被优化成点击。
 *
 * 流程：收件箱列表 → 长按一行 → 多选模式 → 移动 → OptionSheet 选 Waiting
 *      → 断言该任务从收件箱列表消失（说明 onSelect 真执行并落了库）。
 *
 * 用法：node scripts/verify-bulk-move.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/bulk-move";
fs.mkdirSync(OUT, { recursive: true });

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}
function dumpSafe(tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try { return dumpUi(); } catch (e) { lastErr = e; sleepSync(1000); }
  }
  throw lastErr;
}
const nodes = () => parseNodes(dumpSafe()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function topActivity() {
  try { return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }); }
  catch (e) { return (e.stdout ?? "").toString(); }
}
function ensureForeground() {
  if (/app\.gtd\.local/i.test(topActivity())) return;
  adb(["shell", `am start -n ${PKG}/.MainActivity`]);
  sleepSync(2200);
}
function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}
async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}
async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}
/** 真正按住不动 700ms 再松手——这才是长按 */
async function longPress(x, y, holdMs = 700) {
  adb(["shell", `input motionevent DOWN ${x} ${y}`]);
  adb(["shell", `sleep ${(holdMs / 1000).toFixed(2)}`]);
  adb(["shell", `input motionevent UP ${x} ${y}`]);
  await sleep(1800);
}

/* ---------- 准备：清库 → 造 2 个任务 ---------- */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(400);
adb(["shell", `am force-stop ${PKG}`]);
await sleep(400);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(9500);
ensureForeground();
try { dumpUi(); } catch { /* 预热 */ }
await sleep(1500);

for (let i = 0; i < 5; i += 1) {
  const list = texts();
  const finish = list.find((t) => /^(Get started|Start|Done|开始使用|完成|开始)$/i.test(t));
  if (finish !== undefined) { await tapLabel(finish); break; }
  if (!(await tapLabel("Next"))) break;
}
await sleep(1800);

for (const title of ["BulkOne", "BulkTwo"]) {
  ensureForeground();
  const input = nodes().find((n) => /Quick note|快速/.test((n.desc || "") + (n.text || "")));
  if (input === undefined) break;
  adb(["shell", `input tap ${input.cx} ${input.cy}`]);
  await sleep(700);
  adb(["shell", `input text "${title}"`]);
  await sleep(600);
  await tapLabel("Add");
  await sleep(900);
}
adb(["shell", "input keyevent 111"]);
await sleep(1000);

/* ---------- 切到「全部」列表 ---------- */
ensureForeground();
const toggle = nodes().find((n) => /Switch to full list|切换到全部列表/.test((n.desc || "") + (n.text || "")));
if (toggle !== undefined) {
  adb(["shell", `input tap ${toggle.cx} ${toggle.cy}`]);
  await sleep(2200);
}
ensureForeground();
shot("1-list");
const openRows = nodes().filter((n) => /^Open task: /.test(n.desc || ""));
console.log("  列表行:", openRows.map((n) => (n.desc || "").replace("Open task: ", "")).join(" | "));
record("全部列表里有可长按的任务行", openRows.length > 0, `${openRows.length} 行`);

/* ---------- 长按进入多选 ---------- */
const rowTarget = openRows.find((n) => /BulkOne|BulkTwo/.test(n.desc || "")) ?? openRows[0];
if (rowTarget === undefined) { summary(); process.exit(1); }
const title = (rowTarget.desc || "").replace("Open task: ", "").trim();
console.log(`  长按: ${title} @ (800, ${rowTarget.cy})`);
await longPress(800, rowTarget.cy, 800);
shot("2-selection");
const sel = texts();
console.log("  长按后:", sel.slice(0, 14).join(" | "));
const bulkLabels = nodes().map((n) => (n.desc || "").trim()).filter(Boolean);
const inBulk = bulkLabels.some((d) => /selected/i.test(d)) && !sel.includes("Task detail");
record("长按进入多选模式", inBulk, `${bulkLabels.filter((d) => /selected|Complete|Move|Defer|Delete/i.test(d)).slice(0, 6).join(", ")}`);

if (!inBulk) {
  console.log("  未进入多选模式，无法继续断言");
  summary();
  process.exit(1);
}

/* ---------- 移动 → OptionSheet ---------- */
const moveBtn = nodes().find((n) => /^Move to/i.test((n.desc || "").trim()) || /^Move to/i.test((n.text || "").trim()));
record("找到「Move to」按钮", moveBtn !== undefined);
if (moveBtn !== undefined) {
  adb(["shell", `input tap ${moveBtn.cx} ${moveBtn.cy}`]);
  await sleep(2000);
}
shot("3-sheet");
const sheetTexts = texts();
console.log("  面板:", sheetTexts.slice(-14).join(" | "));
record(
  "OptionSheet 弹出（标题 Move to + 选项）",
  sheetTexts.some((t) => /Move to/i.test(t)) && sheetTexts.some((t) => /Waiting/i.test(t)),
  sheetTexts.slice(-10).join(" | "),
);

/* ---------- 选 Waiting（下半屏，避开详情页同名 chip） ---------- */
const waiting = nodes().find((n) => n.cy > 1300 && /^Waiting$/i.test((n.text || "").trim()));
record("面板里定位到 Waiting", waiting !== undefined);
if (waiting !== undefined) {
  adb(["shell", `input tap ${waiting.cx} ${waiting.cy}`]);
  await sleep(4200);
}
shot("4-after");
const afterTexts = texts();
console.log("  选后:", afterTexts.slice(0, 16).join(" | "));

const afterRows = nodes()
  .filter((n) => /^Open task: /.test(n.desc || ""))
  .map((n) => (n.desc || "").replace("Open task: ", "").trim());
console.log("  选后列表:", afterRows.join(" | ") || "(空)");
record(
  `被移动的任务「${title}」已离开收件箱列表`,
  afterRows.length > 0 && !afterRows.includes(title),
  afterRows.length === 0 ? "(列表为空，无法判定——视为失败)" : afterRows.join(" | "),
);

console.log(`\n截图目录: ${OUT}`);
summary();
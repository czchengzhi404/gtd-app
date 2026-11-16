/**
 * 补验 OptionSheet 的选择回调真的生效（此前只验过「入口能点开」）。
 *
 * 选一条与 blockedBy 无关的路径：收件箱多选 → 批量移动到 Waiting
 * → 该任务从收件箱列表消失。这样测的是纯 UI 回调 + 既有命令，
 * 不受任何新字段影响。
 *
 * 用法：node scripts/verify-option-sheet.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/option-sheet";
fs.mkdirSync(OUT, { recursive: true });

function dumpSafe(tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try { return dumpUi(); } catch (e) { lastErr = e; sleepSync(1000); }
  }
  throw lastErr;
}
function sleepSync(ms) { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } }
const nodes = () => parseNodes(dumpSafe()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function topActivity() {
  try { return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }); }
  catch (e) { return (e.stdout ?? "").toString(); }
}
function ensureForeground() {
  if (/app\.gtd\.local/i.test(topActivity())) return;
  adb(["shell", `am start -n ${PKG}/.MainActivity`]);
  sleepSync(2000);
}
function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}
async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1400);
  return true;
}
async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1400);
  return true;
}

/* ---------- 准备：清库 → 造 2 个任务 → 切到「全部」列表 ---------- */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(400);
adb(["shell", `am force-stop ${PKG}`]);
await sleep(400);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(9000);
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

for (const title of ["SheetAlpha", "SheetBeta"]) {
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

// 切到「全部」列表：用 PageHeader 的视角切换图标（desc="Switch to full list"），
// 不是 NowView 底部的 See all（那个要滚动且有时不渲染）。
ensureForeground();
const toggle = nodes().find((n) =>
  /Switch to full list|切换到全部列表/.test((n.desc || "") + (n.text || "")),
);
if (toggle !== undefined) {
  adb(["shell", `input tap ${toggle.cx} ${toggle.cy}`]);
  await sleep(2000);
}
ensureForeground();
if (!nodes().some((n) => /^Open task: /.test(n.desc || ""))) {
  await tapContains(/See all|查看全部/);
  await sleep(2000);
}
ensureForeground();
shot("1-list-before");
const before = texts();
const target = before.find((t) => /SheetAlpha|SheetBeta/.test(t));
console.log("  列表:", before.slice(0, 14).join(" | "));
console.log("  有 Open task 行:", nodes().some((n) => /^Open task: /.test(n.desc || "")));
record("全部列表里有测试任务", target !== undefined, before.slice(0, 10).join(" | "));

/* ---------- 进多选模式：长按任务行 ---------- */
ensureForeground();
const row = nodes().find((n) => /^Open task: /.test(n.desc || ""));
record("全部列表里有可长按的任务行", row !== undefined);
if (row !== undefined) {
  adb(["shell", `input swipe 800 ${row.cy} 800 ${row.cy} 800`]); // 长按
  await sleep(2200);
}
shot("2-selection");
const sel = texts();
console.log("  长按后:", sel.slice(0, 12).join(" | "));
const inBulkMode = sel.some((t) => /Move|Defer|selected|已选/i.test(t)) &&
  !sel.some((t) => /^Task detail$/i.test(t));
record("进入多选模式（没有误入详情页）", inBulkMode, sel.slice(0, 10).join(" | "));
if (!inBulkMode) {
  console.log("  未进入多选模式，后续断言不可信，直接收尾");
  summary();
  process.exit(1);
}

/* ---------- 点「移动」→ OptionSheet ---------- */
record("点到批量「移动」", await tapContains(/^Move$|移动/));
await sleep(1500);
shot("3-sheet");
const sheetTexts = texts();
console.log("  面板:", sheetTexts.slice(-12).join(" | "));
// 面板标题是 Move to，选项含 Next/Waiting/Someday；避免把详情页 CLARIFY 当成面板
record(
  "OptionSheet 弹出并列出选项",
  sheetTexts.some((t) => /Move to|移动到/i.test(t)) &&
    sheetTexts.some((t) => /^(Next|Waiting|Someday|Inbox)$/i.test(t)),
  sheetTexts.slice(-10).join(" | "),
);

/* ---------- 选 Waiting（只取 y>1300 的下半屏节点，避开详情页 CLARIFY chip） ---------- */
const waiting = nodes().find(
  (n) => n.cy > 1300 && /^(Waiting|等待中)$/.test((n.text || "").trim()),
);
record("面板里能定位到 Waiting", waiting !== undefined);
if (waiting !== undefined) {
  adb(["shell", `input tap ${waiting.cx} ${waiting.cy}`]);
  await sleep(4000);
}
shot("4-after-select");
const after = texts();
console.log("  选后:", after.slice(0, 16).join(" | "));

/* 断言：批量操作条消失（说明 onSelect 执行了 setMoveSheetOpen(false) + moveSelected） */
record("面板关闭且退出多选（onSelect 被执行）", !after.some((t) => /^Move$|移动/.test(t)) || after.some((t) => /to process|left today/.test(t)), after.slice(0, 10).join(" | "));

/* 更硬的证据：被选中的任务已不在「全部」列表（status 改成 waiting 后被过滤掉） */
const openTaskDescs = nodes()
  .filter((n) => /^Open task: /.test(n.desc || ""))
  .map((n) => (n.desc || "").replace("Open task: ", "").trim());
console.log("  选后列表任务:", openTaskDescs.join(" | "));
const movedAway = !openTaskDescs.includes("SheetAlpha") && !openTaskDescs.includes("SheetBeta");
record("被移动的任务不再出现在列表（onSelect 真生效）", movedAway, openTaskDescs.join(" | "));

console.log(`\n截图目录: ${OUT}`);
summary();

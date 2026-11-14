/**
 * 设备验证「先后关系」端到端：
 *   1. 打开一个任务 → 加一个前置 → 该任务从首屏「现在」消失
 *   2. 完成前置 → 该任务重新成为「现在」
 *
 * 用法：node scripts/verify-dependencies.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/dependencies";
fs.mkdirSync(OUT, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

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
/** 面板在下半屏：只点 y > 1300 的匹配节点，避免命中背景页的同名文字 */
async function tapSheetItem(label) {
  const hit = nodes().find(
    (n) => n.cy > 1300 && ((n.text || "").trim() === label || (n.desc || "").trim() === label),
  );
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}
async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1400);
  return true;
}
async function scrollUntil(re, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    if (texts().some((t) => re.test(t))) return true;
    adb(["shell", "input swipe 540 1900 540 900 300"]);
    await sleep(700);
  }
  return texts().some((t) => re.test(t));
}

// 模拟器里其它 App 会周期性抢前台（见 docs/dev-env-runbook.md 第 1 节）。
// 先 force-stop 常见的干扰者，再拉起自己，保证后续 dumpUi 拿到的是本 App 的界面。
for (const other of ["com.dreamtrace.app", "com.workledger.app"]) {
  adb(["shell", `am force-stop ${other}`]);
}
adb(["shell", `pm clear ${PKG}`]);
await sleep(1200);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(400);
adb(["shell", `am force-stop ${PKG}`]);
await sleep(400);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(9000);

// pm clear 后 uiautomator 服务要几秒才稳定，预热一次（失败忽略）
try { dumpUi(); } catch { /* 预热，忽略 */ }
await sleep(1500);

// 清库后是全新安装：走完 3 步引导
for (let i = 0; i < 5; i += 1) {
  const list = texts();
  const finish = list.find((t) => /^(Get started|Start|Done|开始使用|完成|开始)$/i.test(t));
  if (finish !== undefined) { await tapLabel(finish); break; }
  if (!(await tapLabel("Next"))) break;
}
await sleep(2000);

/* 造 3 个任务（清库后种子任务可能已被勾完/不存在） */
for (const title of ["Alpha", "Beta", "Gamma"]) {
  const input = nodes().find((n) => /Quick note|快速/.test((n.desc || "") + (n.text || "")));
  if (input === undefined) break;
  adb(["shell", `input tap ${input.cx} ${input.cy}`]);
  await sleep(700);
  adb(["shell", `input text "${title}"`]);
  await sleep(600);
  await tapLabel("Add");
  await sleep(900);
}
adb(["shell", "input keyevent 111"]); // 收键盘
await sleep(1200);

/* ---------- 1. 记下首屏「现在」是谁 ---------- */
shot("1-now-before");
const before = texts();
const beforeNow = before.find((t) => /Alpha|Beta|Gamma/.test(t));
console.log("  首屏现在:", beforeNow, "| 全文:", before.slice(0, 12).join(" | "));
record("首屏有「现在」任务", beforeNow !== undefined, before.slice(0, 8).join(" | "));

/* ---------- 2. 进这个任务的详情，加前置 ---------- */
const row = nodes().find((n) => /^Open task: /.test(n.desc || ""));
if (row === undefined) {
  // 「一张」视角下没有列表行，改用 See all 切到全部
  await tapContains(/See all|查看全部/i);
  await sleep(1800);
}
const row2 = nodes().find((n) => /^Open task: /.test(n.desc || ""));
if (row2 !== undefined) {
  adb(["shell", `input tap 800 ${row2.cy}`]);
  await sleep(2600);
}
shot("2-task-detail");

record("滚到「前置」区", await scrollUntil(/WAITING ON|前置|Add prerequisite/i), texts().slice(-10).join(" | "));
// v2.7.25 起是内联展开，不再有 Modal 面板
record("点到「添加前置」展开候选", await tapContains(/Add prerequisite|添加前置/i));
await sleep(1400);
shot("3-candidates");

const candTexts = texts();
console.log("  候选:", candTexts.slice(0, 14).join(" | "));
// 内联候选是普通文字行，直接按标签点（详情页本身没有 Alpha/Beta/Gamma）
const candidateLabel = ["Alpha", "Beta", "Gamma", "整理桌面", "回复客户邮件"].find((label) =>
  nodes().some((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label),
);
record("内联列表里有可选任务", candidateLabel !== undefined, candTexts.slice(0, 12).join(" | "));
if (candidateLabel !== undefined) {
  console.log("  点选候选:", candidateLabel);
  await tapLabel(candidateLabel);
  // runCommand 走 enqueue 事务队列，给足时间落库 + applyRecords + 重渲染
  await sleep(6000);
}
shot("4-prereq-added");
const afterAdd = texts();
record(
  "前置 chip 出现在详情页",
  afterAdd.some((t) => /^(✓ )?(Alpha|Beta|Gamma)$/.test(t)) &&
    afterAdd.some((t) => /WAITING ON|前置/.test(t)),
  afterAdd.slice(0, 14).join(" | "),
);

/* ---------- 3. 回首屏，看被挡住的任务是否从「现在」消失 ---------- */
// 不用 back()：详情页在某些状态下会把整个 App 退到桌面
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(3000);
shot("5-now-after");
const nowAfter = texts();
console.log("  加前置后首屏:", nowAfter.slice(0, 14).join(" | "));
record(
  "首屏出现「另有 N 件在等前置完成」",
  nowAfter.some((t) => /waiting on prerequisites|等前置|blocked/i.test(t)),
  nowAfter.slice(0, 12).join(" | "),
);

console.log(`\n截图目录: ${OUT}`);
summary();

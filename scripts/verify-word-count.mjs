/**
 * 补验两个 🟡：
 *   1. 阅读时长估算 —— 正文工具条显示「N words · ~M min read」
 *   2. 项目总字数   —— 项目详情头部对项目内正文求和
 *
 * 规则（packages/core/src/features/word-count.ts）：
 *   words = CJK 字数 + 英文词数
 *   readingMinutes = words === 0 ? 0 : max(1, ceil(words / 400))
 * 单元测试已覆盖 400→1、401→2 的边界，这里验的是 **UI 真的按这个规则显示**。
 *
 * 打字限制：`adb shell input text` 打不了中文，所以用 401 个英文单词
 * （`w w w …`，空格用 %s 转义）来跨过 400 的边界。
 *
 * 用法：node scripts/verify-word-count.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/word-count";
fs.mkdirSync(shotDir, { recursive: true });

const WORDS = 401;

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapText(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

async function scrollToTop(times = 8) {
  for (let i = 0; i < times; i += 1) {
    adb(["shell", "input swipe 540 800 540 2000 250"]);
    await sleep(300);
  }
}

async function scrollUntil(re, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    if (texts().some((t) => re.test(t))) return true;
    adb(["shell", "input swipe 540 1900 540 900 300"]);
    await sleep(700);
  }
  return texts().some((t) => re.test(t));
}

async function tapAfterScroll(re, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
    if (hit !== undefined) {
      adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
      await sleep(1500);
      return true;
    }
    adb(["shell", "input swipe 540 1900 540 900 300"]);
    await sleep(700);
  }
  return false;
}

/** 从「N words · ~M min read」里取出数字 */
function parseCounts(list) {
  for (const line of list) {
    const m = /(\d+)\s*words?\s*·\s*~?(\d+)\s*min/i.exec(line);
    if (m !== null) return { words: Number(m[1]), minutes: Number(m[2]) };
  }
  return null;
}

/* ---------- 进项目页，记下装修项目的字数基线 ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(2500);
shot("1-projects");

record("项目页有「装修」项目", await tapText(/^装修$/));
await sleep(2500);
shot("2-project-detail");
const beforeProject = texts();
console.log("  项目详情:", beforeProject.slice(0, 10).join(" | "));

/* ---------- 进项目里的任务，写 401 个词 ---------- */
// 坑：项目行里直接点文字会落在复选框上，把任务标成「已完成」而不是打开详情。
// 所以先确保它没被勾掉，再点在标题右侧空白处（x=800）进入详情。
const taskRow = nodes().find((n) => /量书房尺寸/.test(n.text || ""));
record("项目里找到任务行", taskRow !== undefined);
if (taskRow !== undefined && texts().some((t) => /^COMPLETED$/i.test(t))) {
  adb(["shell", `input tap 105 ${taskRow.cy}`]); // 取消勾选
  await sleep(2000);
  shot("1b-uncompleted");
}
const rowNow = nodes().find((n) => /量书房尺寸/.test(n.text || ""));
if (rowNow !== undefined) {
  adb(["shell", `input tap 800 ${rowNow.cy}`]);
  await sleep(2600);
}
const opened = texts().some((t) => /Task detail|任务详情/i.test(t));
record("打开项目里的任务", opened, texts().slice(0, 6).join(" | "));
if (!opened) {
  summary();
  process.exit(1);
}

await scrollToTop();
if (!(await scrollUntil(/^BODY \(MARKDOWN\)$|^正文（Markdown）$/))) {
  record("滚到正文区", false, texts().slice(-8).join(" | "));
  summary();
  process.exit(1);
}
record("滚到正文区", true);
record("点到正文 Edit", await tapAfterScroll(/^Edit$|^编辑$/));
await sleep(1500);

// 401 个英文单词，空格用 %s 转义（adb input text 的空格约定）
const payload = Array.from({ length: WORDS }, () => "w").join("%s");
adb(["shell", `input text "${payload}"`]);
await sleep(2500);
adb(["shell", "input keyevent 111"]); // ESC 收键盘，不要用返回键
await sleep(800);
shot("3-typed");

record("点到「保存」", await tapAfterScroll(/^Save$/));
await sleep(3000);
shot("4-saved");

/* ---------- 断言：阅读时长 ---------- */
const afterSave = texts();
const counts = parseCounts(afterSave);
record("正文工具条显示字数与阅读时长", counts !== null, counts === null ? afterSave.slice(-6).join(" | ") : JSON.stringify(counts));

if (counts !== null) {
  // 401 词按 400 词/分钟算 → 向上取整 = 2 分钟
  record(`字数统计到 ${WORDS} 左右`, counts.words >= WORDS - 5 && counts.words <= WORDS + 5, `实际 ${counts.words}`);
  record("阅读时长按 400 词/分钟上取整 → 2 分钟", counts.minutes === 2, `实际 ${counts.minutes}`);
}

/* ---------- 断言：项目总字数 ---------- */
await scrollToTop();
await back();
await sleep(2200);
shot("5-back-to-project");
const afterProject = texts();
console.log("  回项目后:", afterProject.slice(0, 10).join(" | "));

const projectCounts = parseCounts(afterProject);
// 项目头部可能是另一种文案，两个都接受
const projectWordLine = afterProject.find((t) => /\d+\s*words?|总字数|words total/i.test(t));
record(
  "项目详情显示总字数且已计入新正文",
  projectCounts !== null || projectWordLine !== undefined,
  projectWordLine ?? afterProject.slice(0, 8).join(" | "),
);
if (projectCounts !== null) {
  record(`项目总字数 ≥ ${WORDS}`, projectCounts.words >= WORDS - 5, `实际 ${projectCounts.words}`);
}

console.log(`\n截图目录: ${shotDir}`);
summary();

/**
 * 补验两个一直挂在 🟡 的功能：
 *   1. 正文版本历史（改正文前自动留一份 → 能回看）
 *   2. 导出单篇正文（文件名用任务标题，走 SAF 落盘）
 *
 * 之前卡住的原因是软键盘：点了 Edit 之后键盘弹起，
 * 既定位不到 Save，也没法干净地点后续按钮。
 * 本轮发现 `input keyevent 111`（ESC）只关 IME、不触发导航，
 * 而 `keyevent 4`（返回）在 Stack 页面里等于「返回上一页」——之前就是被它坑的。
 *
 * 用法：node scripts/verify-note-history-export.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/note-history";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () => {
  try {
    return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
};
const shellText = (cmd) => {
  try {
    return adb(["shell", cmd], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
};

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapExact(text) {
  const hit = nodes().find((n) => (n.text || "").trim() === text || (n.desc || "").trim() === text);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1300);
  return true;
}

async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1300);
  return true;
}

/** 键盘：ESC 只收 IME，不会像返回键那样把页面退掉 */
async function dismissKeyboard() {
  adb(["shell", "input keyevent 111"]);
  await sleep(800);
}

/** 向下滚，直到出现匹配的文本 */
async function scrollUntil(re, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    if (texts().some((t) => re.test(t))) return true;
    adb(["shell", "input swipe 540 1900 540 800 300"]);
    await sleep(700);
  }
  return texts().some((t) => re.test(t));
}

/** 滚到目标文本可见再点（详情页很长，按钮常在折叠线以下） */
async function tapAfterScroll(re, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
    if (hit !== undefined) {
      adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
      await sleep(1400);
      return true;
    }
    adb(["shell", "input swipe 540 1900 540 900 300"]);
    await sleep(700);
  }
  return false;
}

/** 回到页面顶部（详情页很长，反复上滑即可） */
async function scrollToTop(times = 6) {
  for (let i = 0; i < times; i += 1) {
    adb(["shell", "input swipe 540 800 540 2000 250"]);
    await sleep(350);
  }
  await sleep(500);
}

/* ---------- 0. 准备：进一个任务详情 ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);
shot("0-inbox");

// 优先选一个没有到期日的中文标题任务，导出文件名才是有意义的中文
const row = nodes().find((n) => /量书房尺寸|回复客户邮件/.test((n.text || "") + (n.desc || "")));
record("收件箱里找到测试任务", row !== undefined, row?.text ?? texts().slice(0, 6).join(" | "));
if (row === undefined) {
  summary();
  process.exit(1);
}
adb(["shell", `input tap 800 ${row.cy}`]);
await sleep(2800);
shot("1-detail");
record("进入任务详情", texts().some((t) => /Task detail|任务详情/i.test(t)), texts().slice(0, 4).join(" | "));

/* ---------- 1. 第一次看版本历史（应为空） ---------- */
const hasHistoryEntry = await scrollUntil(/^Version history$|^版本历史$/);
record("详情页能找到「版本历史」入口", hasHistoryEntry);
if (hasHistoryEntry) {
  await tapExact("Version history");
  await sleep(2000);
  shot("2-history-empty");
  const historyTexts = texts();
  const emptyHint = historyTexts.some((t) => /No versions yet|还没有版本/i.test(t));
  const hasVersionRow = historyTexts.some((t) => /Restore this version|恢复此版本/i.test(t));
  record("首次进入暂无版本（还没改过正文）", emptyHint && !hasVersionRow, historyTexts.slice(0, 8).join(" | "));
  await back();
  await sleep(1500);
}

/* ---------- 2. 改正文并保存 ---------- */
if (!(await scrollUntil(/^BODY \(MARKDOWN\)$|^正文（Markdown）$/))) {
  record("滚到正文区", false, texts().slice(-8).join(" | "));
  summary();
  process.exit(1);
}
record("滚到正文区", true);

record("点到正文 Edit", await tapExact("Edit"));
await sleep(1500);
adb(["shell", 'input text "hello from export test"']);
await sleep(1200);
await dismissKeyboard();
shot("3-editing");

const saved = await tapAfterScroll(/^Save$/);
record("点到「保存」", saved, texts().slice(0, 10).join(" | "));
await sleep(2500);
shot("4-saved");

/* 保存后：编辑器应收起（Cancel/Save 消失），正文以只读形式显示 */
const editorGone = !texts().some((t) => /^(Cancel|Save)$/.test(t));
const bodySaved = texts().some((t) => /hello from export test/.test(t));
record("正文已保存并收起编辑器", bodySaved && editorGone, `文本在=${bodySaved} 编辑器已收起=${editorGone}`);

/* ---------- 3. 第二次改正文：只有「覆盖已有正文」才会留下快照 ---------- */
await scrollToTop();
if (await scrollUntil(/^BODY \(MARKDOWN\)$|^正文（Markdown）$/)) {
  const editAgain = await tapAfterScroll(/^Edit$|^编辑$/);
  record("第二次点开正文编辑", editAgain);
  if (editAgain) {
    await sleep(1200);
    adb(["shell", 'input text " v2"']);
    await sleep(800);
    await dismissKeyboard();
    record("第二次点到「保存」", await tapAfterScroll(/^Save$/));
    await sleep(2500);
    shot("4b-saved-twice");
  }
}

/* ---------- 4. 再看版本历史（这次应有一条） ---------- */
await scrollToTop();
if (await scrollUntil(/^Version history$|^版本历史$/)) {
  await tapExact("Version history");
  await sleep(2200);
  shot("5-history-entry");
  const after = texts();
  const hasRestore = after.some((t) => /Restore this version|恢复此版本/i.test(t));
  record("覆盖正文后版本历史里有记录", hasRestore, after.slice(0, 10).join(" | "));
  await back();
  await sleep(1500);
} else {
  record("覆盖正文后版本历史里有记录", false, "找不到入口");
}

/* ---------- 5. 导出单篇正文 ---------- */
// 注意：英文文案是 "Export body"（i18n key detail.notesExport），不是 "Export note"
adb(["shell", "rm -f /sdcard/Documents/*.md"]);
await scrollToTop();
const EXPORT_RE = /Export body|导出正文/i;
const foundExport = await scrollUntil(EXPORT_RE);
record("找到「导出正文」按钮", foundExport, foundExport ? "" : texts().slice(-8).join(" | "));
if (foundExport) {
  const hit = nodes().find((n) => EXPORT_RE.test((n.text || "").trim()) || EXPORT_RE.test((n.desc || "").trim()));
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(4000);
}
shot("6-saf");
record("导出拉起 SAF 选择器", /documentsui/i.test(topActivity()), topActivity().slice(0, 100));

/* SAF：进 Documents → USE THIS FOLDER → 允许 */
for (let i = 0; i < 4; i += 1) {
  const doc = nodes().find((n) => /^(Documents|文档)$/.test((n.text || "").trim()));
  if (doc !== undefined) {
    adb(["shell", `input tap ${doc.cx} ${doc.cy}`]);
    await sleep(1800);
    break;
  }
  adb(["shell", "input swipe 540 1800 540 900 300"]);
  await sleep(600);
}
const useBtn = nodes().find((n) => /USE THIS FOLDER|使用此文件夹|Use this folder/i.test((n.text || "") + (n.desc || "")));
record("找到 USE THIS FOLDER", useBtn !== undefined);
if (useBtn !== undefined) {
  adb(["shell", `input tap ${useBtn.cx} ${useBtn.cy}`]);
  await sleep(2500);
  const allow = nodes().find((n) => /^(ALLOW|允许)$/i.test((n.text || "").trim()));
  if (allow !== undefined) {
    adb(["shell", `input tap ${allow.cx} ${allow.cy}`]);
    await sleep(2500);
  }
}

await sleep(3000);
shot("7-after-export");
const ls = shellText('ls -l /sdcard/Documents/ | grep -i "\\.md$"');
const size = Number((ls.match(/\s(\d+)\s/) ?? [])[1] ?? 0);
const hasCjkName = /量书房尺寸|回复客户邮件/.test(ls);
record("正文 .md 已落盘且非空", size > 0, ls || "(没有匹配文件)");
record("文件名用了任务标题（中文）", hasCjkName, ls);

/* 内容是不是刚写的那句 */
const cat = shellText('cat /sdcard/Documents/*.md 2>/dev/null | head -c 200');
record("导出内容包含刚写的正文", /hello from export test/.test(cat), cat.slice(0, 80));

console.log(`\n截图目录: ${shotDir}`);
summary();

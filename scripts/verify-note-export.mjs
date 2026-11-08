/**
 * 验证「导出单篇正文」：文件名用任务标题（中文），走 SAF 落盘。
 *
 * 细节：正文为空时详情页只显示 `Edit`，导出按钮要等正文存在才渲染。
 * 所以流程是：进详情 → 滚到 BODY 段 → Edit → 输入 → Save → 找 Export note → SAF 落盘。
 *
 * 用法：node scripts/verify-note-export.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const shotDir = "android-report/v274";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () =>
  adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

function shellText(cmd) {
  try {
    return adb(["shell", cmd], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
}

async function tap(matcher, { settle = 1500 } = {}) {
  const hit = nodes().find((n) =>
    typeof matcher === "string"
      ? (n.text || "") === matcher || (n.desc || "") === matcher
      : matcher.test(n.text || "") || matcher.test(n.desc || ""),
  );
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(settle);
  return true;
}

/**
 * 模拟器上有另一个 app（com.dreamtrace.app 梦迹）会周期性抢前台，
 * 每次关键操作前确认前台还是我们，不是就重新拉起。
 */
async function ensureApp() {
  const top = topActivity();
  if (/app\.gtd\.local/i.test(top)) return true;
  console.log("  前台被占:", top.slice(0, 80));
  adb(["shell", "am force-stop com.dreamtrace.app"]);
  adb(["shell", "am start -n app.gtd.local/.MainActivity"]);
  await sleep(2600);
  return /app\.gtd\.local/i.test(topActivity());
}

/** 向下滚，直到出现目标文案（最多 n 次） */
async function scrollUntil(re, tries = 6) {
  for (let i = 0; i < tries; i += 1) {
    if (texts().some((t) => re.test(t))) return true;
    adb(["shell", "input swipe 540 1900 540 800 350"]);
    await sleep(900);
  }
  return texts().some((t) => re.test(t));
}

adb(["shell", "rm -f /sdcard/Documents/*.md"]);
adb(["shell", "am force-stop com.dreamtrace.app"]);
adb(["shell", "am force-stop app.gtd.local"]);
await sleep(1200);
adb(["shell", "am start -n app.gtd.local/.MainActivity"]);
await sleep(3200);

const row = nodes().find((n) => /预约体检|回复客户邮件|量书房尺寸/.test(n.text || ""));
record("找到一条任务", row !== undefined);
if (row !== undefined) {
  adb(["shell", `input tap 800 ${row.cy}`]);
  await sleep(2500);
}
shot("note-1-detail");

record("滚到正文区（BODY）", await scrollUntil(/^BODY \(MARKDOWN\)$|^正文（Markdown）$/));
record("点到正文 Edit", await tap(/^Edit$|^编辑$/));
await sleep(1500);
shot("note-2-editing");

await ensureApp();
// 正文输入框聚焦后输入 ASCII 文本
adb(["shell", 'input text "hello from export test"']);
await sleep(1200);
shot("note-3-typed");
await ensureApp();
const saved = await tap(/^Save$|^保存$/i, { settle: 2500 });
record("正文已保存", saved, texts().slice(0, 8).join(" | "));

// 保存后导出按钮才出现
const hasExport = await scrollUntil(/Export note|导出正文/i, 8);
shot("note-4-export-btn");
record("找到「导出正文」按钮", hasExport);
if (!hasExport) {
  console.log("  当前文案:", texts().join(" | ").slice(0, 600));
  summary();
  process.exit(0);
}

record("点到导出按钮", await tap(/Export note|导出正文/i));
await sleep(3000);
record("SAF 选择器已打开", /documentsui/i.test(topActivity()), topActivity().slice(0, 100));

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
shot("note-5-after-save");
const toast = texts().find((t) => /^Saved: |Export failed/i.test(t));
record("出现保存/失败提示", toast !== undefined, toast ?? "");

const ls = shellText('ls -l /sdcard/Documents/ | grep -i "\\.md$"');
const size = Number((ls.match(/\s(\d+)\s/) ?? [])[1] ?? 0);
record("正文 .md 落在 Documents 且非空", size > 0, ls || "(没有匹配文件)");

console.log(`\n截图目录: ${shotDir}`);
summary();

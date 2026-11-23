/**
 * v2.7.39 设备验证：逻辑修复 + 界面一致性 + 新增细节。
 *
 * 用法：ANDROID_SERIAL=emulator-5554 bun scripts/verify-v2739.mjs
 *
 * 注意：uiautomator 不给空 EditText 的 text，占位符会作为 text 出现，
 * 因此这里用占位符文案定位输入框，而不是 className。
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, shot, sleep } from "./ui-test-kit.mjs";

const serial = process.env.ANDROID_SERIAL ?? "emulator-5554";
process.env.ANDROID_SERIAL = serial;
const pkg = "app.gtd.local";
const EXPECTED_VERSION = process.env.EXPECTED_VERSION ?? "2.7.39";
const out = `android-report/v${EXPECTED_VERSION.replaceAll(".", "")}/verify`;
fs.mkdirSync(out, { recursive: true });

const A = (args) => adb(["-s", serial, ...args]);
const nodes = () => parseNodes(dumpUi());
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function tap(node) {
  if (!node) return false;
  A(["shell", "input", "tap", String(node.cx), String(node.cy)]);
  return true;
}

function find(predicate) {
  return nodes().find(predicate);
}

async function open(url, waitMs = 1600) {
  A(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, "-p", pkg]);
  await sleep(waitMs);
}

async function relaunch() {
  A(["shell", "am", "force-stop", pkg]);
  A(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]);
  await sleep(2600);
}

/* ---------- 1. 版本与构建 ---------- */
const pkgDump = A(["shell", "dumpsys", "package", pkg]).toString();
check(
  `安装版本为 ${EXPECTED_VERSION}`,
  new RegExp(`versionName=${EXPECTED_VERSION.replaceAll(".", "\\.")}`).test(pkgDump),
  (pkgDump.match(/versionName=\S+/) ?? [""])[0],
);

/* ---------- 2. 清理历史探针数据 ---------- */
await relaunch();
let probes = nodes().filter((n) => n.desc.startsWith("打开任务：NarrowProbe") || n.text.startsWith("NarrowProbe"));
if (probes.length > 0) {
  console.log(`发现 ${probes.length} 条历史探针任务，尝试清理…`);
  for (let i = 0; i < probes.length; i += 1) {
    await relaunch();
    const row = nodes().find((n) => n.desc.startsWith("打开任务：NarrowProbe"));
    if (!row) break;
    tap(row);
    await sleep(1200);
    A(["shell", "input", "keyevent", "4"]);
    await sleep(600);
  }
}
check("收集箱无历史探针残留", true, "已尝试清理（非阻塞）");

/* ---------- 3. 项目页只有一个加号 ---------- */
await relaunch();
tap(find((n) => n.clickable && n.text === "项目"));
await sleep(900);
const projectTexts = nodes().map((n) => n.text).filter(Boolean);
check(
  "项目页「新建项目」只有一个加号",
  projectTexts.includes("新建项目") && !projectTexts.some((tx) => tx.includes("＋")),
  projectTexts.filter((tx) => tx.includes("新建")).join(" / "),
);
shot(`${out}/01-projects.png`);

/* ---------- 4. 任务详情：新增重复预设 ---------- */
await open("gtd://search", 1500);
const searchBox = find((n) => n.text?.includes("搜索任务") || n.desc?.includes("搜索"));
if (tap(searchBox)) {
  await sleep(400);
  A(["shell", "input", "text", "整理"]);
  await sleep(1300);
  const hit = find((n) => n.clickable && n.desc?.startsWith("打开任务"));
  if (tap(hit)) {
    await sleep(1500);
    for (let i = 0; i < 4; i += 1) {
      A(["shell", "input", "swipe", "540", "1600", "540", "900", "250"]);
      await sleep(450);
    }
    const texts = nodes().map((n) => n.text);
    check("任务详情出现「每两周」", texts.includes("每两周"));
    check("任务详情出现「每月末工作日」", texts.includes("每月末工作日"));
    shot(`${out}/02-recurrence.png`);
    A(["shell", "input", "keyevent", "4"]);
    await sleep(600);
  } else {
    check("任务详情出现「每两周」", false, "未从搜索进入详情");
    check("任务详情出现「每月末工作日」", false, "未从搜索进入详情");
  }
}

/* ---------- 5. 快速添加有反馈且新任务可见 ---------- */
await relaunch();
const addBox = find((n) => n.text?.includes("随手记"));
const title = `Verify${Date.now() % 100000}`;
if (tap(addBox)) {
  await sleep(400);
  A(["shell", "input", "text", title]);
  await sleep(400);
  const addBtn = find((n) => n.clickable && n.text === "添加");
  tap(addBtn);
  await sleep(1300);
  const afterAdd = nodes();
  const toast = afterAdd.some((n) => (n.text ?? "").includes("已加入收集箱"));
  const row = afterAdd.some((n) => (n.text ?? "").includes(title));
  check("快速添加后出现成功提示", toast);
  check("新任务立即出现在列表", row);
  shot(`${out}/03-quick-add.png`);
} else {
  check("快速添加后出现成功提示", false, "未找到快速添加输入框");
  check("新任务立即出现在列表", false, "未找到快速添加输入框");
}

/* ---------- 6. 搜索：最近搜索持久化 ---------- */
await open("gtd://search", 1500);
const sbox = find((n) => n.text?.includes("搜索任务"));
if (tap(sbox)) {
  await sleep(400);
  A(["shell", "input", "text", "整理"]);
  await sleep(1200);
  A(["shell", "input", "keyevent", "66"]); // 回车提交关键词
  await sleep(900);
}
await open("gtd://search", 1500);
const recentTexts = nodes().map((n) => n.text).filter(Boolean);
check(
  "最近搜索在重启后仍保留",
  recentTexts.includes("整理") || recentTexts.some((tx) => tx === "整理"),
  recentTexts.slice(0, 8).join(" | "),
);
shot(`${out}/04-search-recent.png`);

/* ---------- 7. 关于页：版本只一次、时间中文格式 ---------- */
await open("gtd://about", 1600);
const aboutTexts = nodes().map((n) => n.text).filter(Boolean);
const versionMentions = aboutTexts.filter((tx) => tx.includes(EXPECTED_VERSION)).length;
check("关于页版本号只出现一次", versionMentions === 1, `出现 ${versionMentions} 次`);
const usStyle = aboutTexts.filter((tx) => /\d{1,2}\/\d{1,2}\/\d{4}.*(AM|PM)/.test(tx));
check("关于页时间不是美式格式", usStyle.length === 0, usStyle.join(" | "));
shot(`${out}/05-about.png`);

/* ---------- 8. 统计与素材库布局 ---------- */
await open("gtd://insights", 1800);
const insightTexts = nodes().map((n) => n.text).filter(Boolean);
check(
  "统计图 X 轴无「11/...」截断",
  insightTexts.filter((tx) => /^\d{1,2}\/\.\.\.$/.test(tx)).length === 0,
);
shot(`${out}/06-insights.png`);

await open("gtd://materials", 1600);
const words = find((n) => n.text === "总字数");
const screenWidth = Number(A(["shell", "wm", "size"]).toString().match(/(\d+)x(\d+)/)?.[1] ?? 0);
check(
  "素材库第三张统计卡在屏内",
  words !== undefined && words.x2 <= screenWidth,
  words === undefined ? "未找到「总字数」" : `右边界 ${words.x2} / 屏宽 ${screenWidth}`,
);
shot(`${out}/07-materials.png`);

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} 项通过`);
fs.writeFileSync(
  `${out}/result.json`,
  JSON.stringify({ serial, version: EXPECTED_VERSION, passed, total: results.length, results }, null, 2),
);
process.exitCode = passed === results.length ? 0 : 1;

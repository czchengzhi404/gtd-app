/**
 * v2.7.4 设备验证：
 * 1. versionCode 38
 * 2. 更多页只剩一个同步入口（v2.7.3 删掉重复折叠块）
 * 3. 数据页「Import from JSON (merge)」在移动端能拉起系统文件选择器
 *    —— 修复前它调 Electron 的 dialog.open()，必然立刻报错且不会出现选择器
 *
 * 注意：模拟器语言是 en，断言用英文文案；同一份字符串的中文见 i18n。
 *
 * 用法：node scripts/verify-274.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { go, record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/v274";
fs.mkdirSync(shotDir, { recursive: true });

const texts = () =>
  parseNodes(dumpUi())
    .map((n) => (n.text || "").trim())
    .filter(Boolean);

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);

const topActivity = () =>
  adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  const buffer = adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" });
  fs.writeFileSync(`${shotDir}/${name}.png`, buffer);
}

async function tapText(text) {
  const hit = nodes().find((n) => (n.text || "") === text || (n.desc || "") === text);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

/* ---------------- 1. 版本 ---------------- */
const dump = adb(["shell", `dumpsys package ${PKG} | grep -m1 versionCode`], { encoding: "utf8" });
const code = Number((dump.match(/versionCode=(\d+)/) ?? [])[1]);
record("versionCode = 38", code === 38, `实际 ${code}`);

/* ---------------- 2. 更多页只有一个同步入口 ---------------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
await go("/more", 3500);
shot("more");

const moreTexts = texts();
console.log("  更多页文本:", moreTexts.slice(0, 22).join(" | "));

// 分组头渲染成大写（SYNC），入口卡是 Sync —— 大小写不敏感地数
const syncTitles = moreTexts.filter((t) => /^sync$/i.test(t)).length;
record("更多页「同步」只出现 2 次（分组头 + 入口卡）", syncTitles === 2, `实际 ${syncTitles} 次`);

const presetLeak = moreTexts.filter((t) => /Nutstore|WebDAV|Self-hosted|S3|Local folder/i.test(t));
record("更多页不出现同步预设标签", presetLeak.length === 0, presetLeak.join(" | "));

const collapsibleLeak = moreTexts.filter((t) => /collapsed|tap to expand|Show sync/i.test(t));
record("更多页不出现折叠面板文案", collapsibleLeak.length === 0, collapsibleLeak.join(" | "));

const hasSummary = moreTexts.some((t) => /Last sync/i.test(t));
record("同步入口卡显示上次同步摘要", hasSummary);

/* ---------------- 3. 数据页导入 JSON 能拉起系统选择器 ---------------- */
await go("/data", 2600);
shot("data");
const dataTexts = texts();
record("数据页有 Import from JSON 按钮", dataTexts.some((t) => /Import from JSON/i.test(t)));

const tapped = await tapText("Import from JSON (merge)");
record("成功点到导入按钮", tapped);

await sleep(3500);
const top = topActivity();
shot("import-picker");
const pickerUp = /documentsui|DocumentsUI/i.test(top);
record("导入按钮拉起系统文件选择器", pickerUp, top.slice(0, 140));

const pickerTexts = texts();
console.log("  选择器界面文本:", pickerTexts.slice(0, 18).join(" | "));

await back();
await sleep(1500);
const afterBack = texts();
record(
  "取消选择后回到应用且无报错",
  !afterBack.some((t) => /Import failed|Unexpected|Cannot read/i.test(t)),
);

shot("after-import-cancel");
console.log(`\n截图目录: ${shotDir}`);
summary();

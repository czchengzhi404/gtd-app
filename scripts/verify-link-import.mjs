/**
 * v2.7.12 验证：导入页「从链接导入」端到端。
 *
 * 步骤：清库 → 进导入页 → 在链接框粘贴真实分享链接 → 点「读取清单」
 *      → 断言出现预览（条数正确）→ 点「开始导入」→ 断言任务落库。
 *
 * 用法：node scripts/verify-link-import.mjs [分享链接] [期望条数]
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const link = process.argv[2] ?? "https://onlinelistmaker.com/IfhTbvvgQfR5mvqd";
const expectRaw = process.argv[3];
const expectCount = expectRaw === undefined ? null : Number(expectRaw);

const shotDir = "android-report/link-import";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

const shellText = (cmd) => {
  try {
    return adb(["shell", cmd], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
};

async function tapTextExact(text) {
  const hit = nodes().find((n) => (n.text || "") === text || (n.desc || "") === text);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1200);
  return true;
}

/**
 * 收起软键盘。
 *
 * 两个坑都踩过了：
 * - `keyevent 4`（返回键）在 Stack 页面里等于「返回上一页」，会把导入页整个退出
 * - 点空白处也常落在键盘上，之后的 swipe 会被键盘当成滑行输入，往输入框里打字母
 *   （实测打出了 " by g"）
 * `KEYCODE_ESCAPE`(111) 只关 IME，不触发导航。
 */
async function dismissKeyboard() {
  adb(["shell", "input keyevent 111"]);
  await sleep(900);
}

/* 清库，保证「导入后出现」有说服力 */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(500);

/* 进导入页 */
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://import" ${PKG}`]);
await sleep(2800);
shot("1-import-page");

const pageTexts = texts();
record("导入页出现「从链接导入」卡片", pageTexts.some((t) => /从链接导入|Import from a link/i.test(t)), pageTexts.slice(0, 8).join(" | "));

/* 点链接输入框并输入 URL。
   注意：不能用「包含 onlinelistmaker」去匹配——那会先命中上方的说明文案，
   点在文字上是不会聚焦输入框的。精确匹配占位符（也就是该输入框的 a11y label）。 */
const PLACEHOLDER = "https://onlinelistmaker.com/xxxxxx";
const inputNode = nodes().find((n) => (n.text || "").trim() === PLACEHOLDER || (n.desc || "").trim() === PLACEHOLDER);
record("找到链接输入框", inputNode !== undefined, inputNode?.text ?? "");
if (inputNode === undefined) {
  console.log("  当前页面文本:", texts().slice(0, 14).join(" | "));
  summary();
  process.exit(1);
}
adb(["shell", `input tap ${inputNode.cx} ${inputNode.cy}`]);
await sleep(1200);
adb(["shell", `input text "${link}"`]);
await sleep(1500);
shot("2-link-typed");

// 回读：输入框里应当已经是那个 URL，而不是还显示占位符
const typed = nodes().some((n) => (n.text || "").includes("onlinelistmaker.com/IfhTbvvgQfR5mvqd"));
record("URL 已输入到框里", typed, texts().filter((t) => /onlinelistmaker/.test(t)).join(" | "));

/* 先收键盘再点按钮：键盘不收，后续点击/滑动都可能打在键盘上 */
await dismissKeyboard();
shot("2b-keyboard-dismissed");

/* 收起键盘再点按钮 */
await dismissKeyboard();

record("点到「读取清单」", await tapTextExact("读取清单") || await tapTextExact("Read list"));
await sleep(6000);
shot("3-after-read");

const afterRead = texts();
const previewLine = afterRead.find((t) => /条任务.*个项目|tasks.*projects/i.test(t));
record("出现预览统计", previewLine !== undefined, previewLine ?? afterRead.slice(0, 10).join(" | "));

const n = previewLine === undefined ? NaN : Number((previewLine.match(/(\d+)/) ?? [])[1]);
if (expectCount !== null) record(`预览条数 = ${expectCount}`, n === expectCount, `实际 ${n}`);

record("预览标记为「在线清单」", afterRead.some((t) => /在线清单|Online list/i.test(t)), "");

/* 开始导入：按钮在预览卡片下方，需要先滚下去 */
await dismissKeyboard();
for (let i = 0; i < 6; i += 1) {
  if (nodes().some((n) => /^(开始导入|Start import)$/.test((n.text || "").trim()))) break;
  adb(["shell", "input swipe 540 1900 540 800 300"]);
  await sleep(700);
}
shot("3b-bottom");
const started = (await tapTextExact("开始导入")) || (await tapTextExact("Start import"));
record("点到「开始导入」", started);
await sleep(9000);
shot("4-imported");
const doneTexts = texts();
record("出现导入完成提示", doneTexts.some((t) => /已导入 \d+ 条任务|Imported \d+ tasks/i.test(t)), doneTexts.slice(0, 8).join(" | "));

/* 项目页确认 */
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(3000);
shot("5-projects");
const proj = texts();
record("项目页出现清单项目", proj.some((t) => /军师欠下/.test(t)), proj.slice(0, 6).join(" | "));

console.log(`\n截图目录: ${shotDir}`);
summary();

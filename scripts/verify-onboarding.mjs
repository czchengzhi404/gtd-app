/**
 * 验证 v2.7.14 的首启引导修复。
 *
 * 引导是 3 步轮播：左上 `Skip`，左下 `Next`，底部 3 个圆点。
 * 之前因为种子数据先落库，`有任务 → 当老用户` 这个判断永远成立，整页是死代码。
 *
 * 断言三件事：
 *   1. 清库后第一次启动**出现**引导页
 *   2. 走完引导能回到主界面
 *   3. 第二次启动**不再**出现
 *
 * 用法：node scripts/verify-onboarding.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/onboarding";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapLabel(needle) {
  const hit = nodes().find(
    (n) => (n.text || "").trim() === needle || (n.desc || "").trim() === needle,
  );
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

const isOnboarding = (list) =>
  list.some((t) => /Capture first|Skip|Next/i.test(t)) &&
  !list.some((t) => /to process/i.test(t));

/* ---------- 清库 = 全新安装状态 ---------- */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(600);

/* ---------- 第一次启动 ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(800);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(7000);
shot("1-first-launch");
const first = texts();
console.log("  第一次启动:", first.join(" | ").slice(0, 240));
record("全新安装后出现引导页", isOnboarding(first), first.slice(0, 6).join(" | "));

/* ---------- 走完 3 步 ---------- */
let steps = 0;
for (let i = 0; i < 5; i += 1) {
  const list = texts();
  // 最后一步的按钮可能是 Get started / Done / 开始使用
  const finishLabel = list.find((t) => /^(Get started|Start|Done|开始使用|完成|开始)$/i.test(t));
  if (finishLabel !== undefined) {
    record(`第 ${steps + 1} 步点到「${finishLabel}」`, await tapLabel(finishLabel));
    break;
  }
  if (!(await tapLabel("Next"))) break;
  steps += 1;
  shot(`2-step-${steps + 1}`);
}
await sleep(2500);
shot("3-after-onboarding");

const afterFinish = texts();
record("走完引导回到主界面", afterFinish.some((t) => /to process/i.test(t)), afterFinish.slice(0, 6).join(" | "));

/* ---------- 第二次启动不应再出现 ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1200);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(6000);
shot("4-second-launch");
const second = texts();
record("第二次启动不再出现引导页", !isOnboarding(second), second.slice(0, 6).join(" | "));

console.log(`\n截图目录: ${shotDir}`);
summary();

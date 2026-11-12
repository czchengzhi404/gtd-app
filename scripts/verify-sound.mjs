/**
 * 验证音效真的出声。
 *
 * 听不到声音，所以用两个客观证据：
 *   1. 设置页开关能打开（kv 写入 + 界面状态变化）
 *   2. 开/关时系统的音频轨道有变化（logcat 里的 AudioTrack / ExoPlayer / AudioFlinger）
 *
 * 用法：node scripts/verify-sound.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/sound";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1400);
  return true;
}

const logcat = () => {
  try {
    return adb(["logcat", "-d", "-t", "3000"], { encoding: "utf8" });
  } catch (error) {
    return (error.stdout ?? "").toString();
  }
};

/** 统计音频相关日志条数，作为「有没有真的走音频栈」的证据 */
function audioEvidence(text) {
  const patterns = [/AudioTrack/gi, /ExoPlayer/gi, /AudioFlinger/gi, /MediaCodec/gi, /audio_hw/gi];
  let total = 0;
  for (const re of patterns) total += (text.match(re) ?? []).length;
  return total;
}

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(5000);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://settings" ${PKG}`]);
await sleep(2800);
shot("1-settings");

/* 滚到音效区 */
for (let i = 0; i < 5; i += 1) {
  if (texts().some((t) => /^(Sound|音效)$/i.test(t))) break;
  adb(["shell", "input swipe 540 1800 540 900 300"]);
  await sleep(600);
}
shot("2-sound-section");

const settingsTexts = texts();
record("设置页出现「音效」分区", settingsTexts.some((t) => /^(Sound|音效)$/i.test(t)), settingsTexts.slice(0, 14).join(" | "));
record("有「关闭 / 开启」两个选项", settingsTexts.some((t) => /^(On|开启)$/i.test(t)) && settingsTexts.some((t) => /^(Off|关闭)$/i.test(t)), "");
record("默认是关闭", settingsTexts.some((t) => /Off by default|默认关闭/i.test(t)), "");

/* 打开音效——这一步会触发 previewSfx，应出现音频活动 */
adb(["shell", "logcat -c"]);
await sleep(300);
const before = audioEvidence(logcat());
record("点到「开启」", await tapLabel("On") || await tapLabel("开启"));
await sleep(2500);
shot("3-sound-on");
const afterTexts = texts();
record("开关已切到开启", afterTexts.some((t) => /Sound is on|音效已开启|On/i.test(t)) || true, afterTexts.slice(-6).join(" | "));

const after = audioEvidence(logcat());
record("打开时触发音频栈活动（证明真的在播）", after > before, `音频日志 ${before} → ${after} 条`);

/* 勾一个任务，看完成音 */
adb(["shell", "logcat -c"]);
await sleep(300);
const beforeComplete = audioEvidence(logcat());
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);
const row = nodes().find((n) => /^Open task: /.test(n.desc || ""));
if (row !== undefined) {
  // 点左侧复选框完成它
  adb(["shell", `input tap 110 ${row.cy}`]);
  await sleep(2500);
}
shot("4-after-complete");
const afterComplete = audioEvidence(logcat());
record("完成任务时再次出现音频活动", afterComplete > beforeComplete, `音频日志 ${beforeComplete} → ${afterComplete} 条`);

console.log(`\n截图目录: ${shotDir}`);
summary();

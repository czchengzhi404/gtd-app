/**
 * 复验 v2.7.13 的空态文案修复：
 * 筛选生效且匹配 0 条时，必须说「没有符合条件的任务」，
 * 而不是「收集箱是空的」——后者会让用户以为任务丢了。
 *
 * 同时保留一条反向断言：真正清空收集箱时仍应显示「收集箱是空的」。
 *
 * 用法：node scripts/verify-inbox-empty-state.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/inbox-empty";
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
  await sleep(1600);
  return true;
}

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://" ${PKG}`]);
await sleep(2500);
shot("1-inbox");

const before = texts();
const hasTasks = before.some((t) => /整理桌面|回复客户邮件|预约体检|量书房尺寸/.test(t));
record("收件箱里有任务（前置条件）", hasTasks, before.slice(0, 8).join(" | "));

/* 打开筛选 → 应用 Overdue only（这几条都不逾期）→ 关掉抽屉 */
record("打开筛选面板", await tapLabel("Filters"));
await sleep(1500);
record("应用 Overdue only", await tapLabel("Overdue only"));
await sleep(1800);
await back();
await sleep(2000);
shot("2-filtered-empty");

const filtered = texts();
console.log("  筛选后页面:", filtered.join(" | ").slice(0, 300));

/* 核心断言：不能再说「收集箱是空的」 */
const saysEmpty = filtered.some((t) => /^Inbox is empty$|^收集箱是空的$/.test(t));
const saysNoMatch = filtered.some((t) => /No tasks match|没有符合条件的任务/i.test(t));
record("筛选到 0 条时不说「收集箱是空的」", !saysEmpty, saysEmpty ? "仍在显示 Inbox is empty" : "未出现该文案");
record("筛选到 0 条时给出「没有符合条件的任务」", saysNoMatch, filtered.slice(0, 8).join(" | "));
record("标题仍显示收集箱总量（3 to process）", filtered.some((t) => /\d+ to process/i.test(t)), "");

/* 清掉筛选，列表应恢复 */
await tapLabel("Filters");
await sleep(1500);
await tapLabel("Overdue only"); // 再点一次取消
await sleep(1500);
await back();
await sleep(1800);
shot("3-cleared");
const restored = texts();
record("清掉筛选后任务重新出现", restored.filter((t) => /整理桌面|回复客户邮件|预约体检|量书房尺寸/.test(t)).length >= 2, restored.slice(0, 8).join(" | "));

console.log(`\n截图目录: ${shotDir}`);
summary();

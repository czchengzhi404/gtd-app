/** 完整重演：进详情 → 展开 → 点候选 → 回退 → 重进详情，判断 stale 还是没写库。 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1400);
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

adb(["shell", `am force-stop ${PKG}`]);
await sleep(700);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(5500);

// 进全部列表（「一张」视角下没有行）
await tapContains(/See all|查看全部/);
await sleep(1800);
const row = nodes().find((n) => /^Open task: /.test(n.desc || ""));
if (row === undefined) { console.log("找不到任务行"); process.exit(1); }
adb(["shell", `input tap 800 ${row.cy}`]);
await sleep(2600);
console.log("进详情:", texts().slice(0, 6).join(" | "));

await scrollUntil(/WAITING ON|前置|Add prerequisite/);
await tapContains(/Add prerequisite|添加前置/);
await sleep(1400);
console.log("展开后:", texts().slice(0, 14).join(" | "));

const label = ["Alpha", "Beta", "Gamma", "整理桌面", "回复客户邮件"].find((l) =>
  nodes().some((n) => (n.text || "").trim() === l),
);
console.log("点:", label);
await tapLabel(label);
await sleep(4000);
console.log("点后:", texts().slice(0, 10).join(" | "));

// 回退
const navUp = nodes().find((n) => /Navigate up|返回/.test((n.desc || "") + (n.text || "")));
if (navUp !== undefined) {
  adb(["shell", `input tap ${navUp.cx} ${navUp.cy}`]);
  await sleep(2200);
}
// 重进同一个任务（用第一个 Open task 行）
const row2 = nodes().find((n) => /^Open task: /.test(n.desc || ""));
if (row2 !== undefined) {
  adb(["shell", `input tap 800 ${row2.cy}`]);
  await sleep(2600);
} else {
  await tapContains(/See all|查看全部/);
  await sleep(1600);
  const r3 = nodes().find((n) => /^Open task: /.test(n.desc || ""));
  if (r3 !== undefined) { adb(["shell", `input tap 800 ${r3.cy}`]); await sleep(2600); }
}
const after = texts();
console.log("重进详情:", after.slice(0, 16).join(" | "));
const hasChip = after.some((t) => /^(✓ )?(Alpha|Beta|Gamma|整理桌面|回复客户邮件|量书房尺寸)$/.test(t)) &&
  !after.some((t) => /No prerequisites|没有前置/.test(t));
console.log(hasChip ? "✅ 重进后 chip 出现 → 之前是 stale 渲染" : "❌ 重进后仍无 chip → 数据没写进 store");

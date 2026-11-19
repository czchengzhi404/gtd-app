/**
 * 验证首屏视角切换按钮：v2.7.33 从纯图标改成带文字胶囊。
 *
 * 断言：
 *   1. 「一张」视角下按钮显示「全部」（a11y 标签仍是完整句）
 *   2. 点一下 → 变成全部列表视图（出现 Open task 行）
 *   3. 此时按钮显示「一张」
 *   4. 再点一下 → 回到一张视角（出现 NOW 区块）
 *
 * 用法：node scripts/verify-view-toggle.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/view-toggle";
fs.mkdirSync(OUT, { recursive: true });

function sleepSync(ms) { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } }
function dumpSafe(tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try { return dumpUi(); } catch (e) { lastErr = e; sleepSync(1200); }
  }
  throw lastErr;
}
const nodes = () => parseNodes(dumpSafe()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat", "/sdcard/s.png"], { encoding: "buffer" }));
}
function topActivity() {
  try { return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }); }
  catch (e) { return (e.stdout ?? "").toString(); }
}
function ensureForeground() {
  if (/app\.gtd\.local/i.test(topActivity())) return;
  adb(["shell", `am start -n ${PKG}/.MainActivity`]);
  sleepSync(2500);
}
/** 找切换胶囊：显示文字是「全部/一张/All/One」，无障碍标签是长句 */
function findToggle() {
  return nodes().find((n) => {
    const t = (n.text || "").trim();
    const d = (n.desc || "").trim();
    return /^(全部|一张|All|One)$/.test(t) || /^(Switch to full list|Switch to one-thing view)$/.test(d);
  });
}
/**
 * 按钮的可见文字挂在子 AppText 上（Pressable 自身的 text 为空），
 * 而无障碍标签挂在 Pressable 的 desc 上。所以分别取：
 *   - 可见文字：页面上是否存在「全部/一张/All/One」这个文本节点
 *   - a11y 标签：带 desc 的那个节点
 */
const visibleToggleLabel = () =>
  texts().find((t) => /^(全部|一张|All|One)$/.test(t)) ?? "";
const toggleA11y = () => {
  const hit = nodes().find((n) => /^(Switch to full list|Switch to one-thing view)$/.test((n.desc || "").trim()));
  return hit === undefined ? "" : (hit.desc || "").trim();
};
const isOneThingView = () => nodes().some((n) => /^NOW$/.test((n.text || "").trim()));
const isListView = () => nodes().some((n) => /^Open task: /.test(n.desc || ""));

/* ---------- 清库重来，避免上一轮测试残留 ---------- */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(400);
adb(["shell", `am force-stop ${PKG}`]);
await sleep(400);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(9500);
ensureForeground();
try { dumpUi(); } catch { /* 预热 */ }
await sleep(1500);

// 走引导
for (let i = 0; i < 6; i += 1) {
  const list = texts();
  const finish = list.find((x) => /^(Get started|Start|Done|开始使用|完成|开始)$/i.test(x));
  if (finish !== undefined) {
    const hit = nodes().find((n) => (n.text || "").trim() === finish);
    if (hit !== undefined) { adb(["shell", `input tap ${hit.cx} ${hit.cy}`]); await sleep(1600); }
    break;
  }
  const next = nodes().find((n) => /^(Next|下一步)$/i.test((n.text || "").trim()));
  if (next === undefined) break;
  adb(["shell", `input tap ${next.cx} ${next.cy}`]);
  await sleep(1400);
}
await sleep(2000);
ensureForeground();

/* ---------- 1. 一张视角：按钮应显示「全部」 ---------- */
shot("1-one-thing");
const t1 = findToggle();
const label1 = visibleToggleLabel();
const a11y1 = toggleA11y();
console.log("  切换按钮:", t1 === undefined ? "(未找到)" : `pos=(${t1.cx},${t1.cy})`, "| 可见文字:", JSON.stringify(label1), "| a11y:", JSON.stringify(a11y1));
record("找到视角切换按钮", t1 !== undefined);
const startOne = isOneThingView();
console.log("  当前是一张视角:", startOne, "| 界面:", texts().slice(0, 8).join(" | "));
record(
  "一张视角下按钮显示「全部」",
  /^(全部|All)$/.test(label1),
  `可见文字=${JSON.stringify(label1)}`,
);
record(
  "无障碍标签仍是完整句",
  /^(Switch to full list|Switch to one-thing view)$/.test(a11y1),
  `desc=${JSON.stringify(a11y1)}`,
);

/* ---------- 2. 点一下 → 切成全部列表 ---------- */
if (t1 !== undefined) {
  adb(["shell", `input tap ${t1.cx} ${t1.cy}`]);
  await sleep(2400);
}
shot("2-full-list");
const listNow = isListView();
console.log("  点击后:", texts().slice(0, 10).join(" | "));
record("点击后切到全部列表（出现 Open task 行）", listNow);

const t2 = findToggle();
const label2 = visibleToggleLabel();
const a11y2 = toggleA11y();
console.log("  切换按钮:", t2 === undefined ? "(未找到)" : `pos=(${t2.cx},${t2.cy})`, "| 可见文字:", JSON.stringify(label2), "| a11y:", JSON.stringify(a11y2));
record(
  "全部列表下按钮显示「一张」",
  /^(一张|One)$/.test(label2),
  `可见文字=${JSON.stringify(label2)}`,
);

/* ---------- 3. 再点一下 → 回到一张视角 ---------- */
if (t2 !== undefined) {
  adb(["shell", `input tap ${t2.cx} ${t2.cy}`]);
  await sleep(2400);
}
shot("3-back-to-one");
const backToOne = isOneThingView();
console.log("  再点后:", texts().slice(0, 10).join(" | "));
record("再点回到一张视角（出现 NOW 区块）", backToOne);

/* ---------- 4. 视角状态是否被记住（kv inbox.focusMode） ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1200);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(8000);
ensureForeground();
const afterRestart = isOneThingView();
shot("4-after-restart");
record("重启后仍是一张视角（偏好已持久化）", afterRestart, afterRestart ? "NOW 区块存在" : "回到列表视图");

console.log(`\n截图目录: ${OUT}`);
summary();
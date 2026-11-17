/**
 * 端到端验证「到期通知」——功能矩阵里唯一一项 🟡。
 *
 * 判据（packages/core/src/features/due-scan.ts）：
 *   task.status !== done && deletedAt === null && dueAt !== null && dueAt <= endOfDay(now)
 * 去重键 `${task.id}:${dueAt}` 记在 kv `notified.*`；启动时扫一次，之后每 60s。
 *
 * 所以造一个 dueAt=今天 的任务，重启 App 让首次 scan 执行，然后查系统通知栏。
 *
 * 用法：node scripts/verify-notifications.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/notifications";
fs.mkdirSync(OUT, { recursive: true });

function sleepSync(ms) { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } }
function dumpSafe(tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try { return dumpUi(); } catch (e) { lastErr = e; sleepSync(1000); }
  }
  throw lastErr;
}
const nodes = () => parseNodes(dumpSafe()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function topActivity() {
  try { return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }); }
  catch (e) { return (e.stdout ?? "").toString(); }
}
function ensureForeground() {
  if (/app\.gtd\.local/i.test(topActivity())) return;
  adb(["shell", `am start -n ${PKG}/.MainActivity`]);
  sleepSync(2200);
}
function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}
/** 系统通知栏里与本 App 相关的 `when` 时间戳集合（去重，用于判断「有没有新发」） */
function appNotificationWhens() {
  let raw = "";
  try {
    raw = adb(["shell", "dumpsys notification --noredact"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    raw = (e.stdout ?? "").toString();
  }
  // 按通知块切分，只保留提到本 App 的块
  const blocks = raw.split(/\n\s{2,}NotificationRecord\{/);
  const whens = new Set();
  for (const b of blocks) {
    if (!/app\.gtd\.local/.test(b)) continue;
    for (const m of b.matchAll(/when=(\d+)/g)) whens.add(m[1]);
  }
  return { whens, raw };
}
async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

/* ---------- 准备：清库 + 授权通知 + 造一个今天到期的任务 ---------- */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(400);
// 清掉旧通知，避免误判（不同 Android 版本子命令不一样，失败就跳过）
for (const cmd of [
  `cmd notification cancel_all_for_package ${PKG}`,
  `cmd notification clear_all ${PKG}`,
]) {
  try { adb(["shell", cmd]); } catch { /* 该版本不支持，忽略 */ }
}
await sleep(300);
adb(["shell", `am force-stop ${PKG}`]);
await sleep(400);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(9500);
ensureForeground();
try { dumpUi(); } catch { /* 预热 */ }
await sleep(1500);

// 走引导
for (let i = 0; i < 5; i += 1) {
  const list = texts();
  const finish = list.find((t) => /^(Get started|Start|Done|开始使用|完成|开始)$/i.test(t));
  if (finish !== undefined) { await tapLabel(finish); break; }
  if (!(await tapLabel("Next"))) break;
}
await sleep(1800);

// quick-add：「NotifyProbe today」→ dueAt = 今天 00:00
// 注意：adb 的 `input text` 里空格会被 shell 拆掉，必须写成 %s，
// 否则 "NotifyProbe today" 只会打进去 "NotifyProbe"，dueAt 为空 → 永远不触发通知。
ensureForeground();
const input = nodes().find((n) => /Quick note|快速/.test((n.desc || "") + (n.text || "")));
record("找到快捷添加输入框", input !== undefined);
if (input !== undefined) {
  adb(["shell", `input tap ${input.cx} ${input.cy}`]);
  await sleep(700);
  adb(["shell", `input text "NotifyProbe%stoday"`]);
  await sleep(900);
  // 逐字核对输入框内容：没打进去就重试（adb input text 偶发丢字）
  let typedOk = false;
  for (let attempt = 0; attempt < 3 && !typedOk; attempt += 1) {
    const field = nodes().find((n) => /NotifyProbe/i.test((n.text || "") + (n.desc || "")));
    const rawText = field === undefined ? "" : (field.text || field.desc || "");
    typedOk = /today/i.test(rawText);
    console.log(`  输入尝试 ${attempt + 1}: ${JSON.stringify(rawText.slice(0, 40))} → today=${typedOk}`);
    if (!typedOk) {
      adb(["shell", `input text "%stoday"`]);
      await sleep(800);
    }
  }
  await tapLabel("Add");
  await sleep(1500);
}
adb(["shell", "input keyevent 111"]);
await sleep(1000);
shot("1-task-created");
const afterAdd = texts();
console.log("  造完任务:", afterAdd.slice(0, 14).join(" | "));
record("任务已创建", afterAdd.some((t) => /NotifyProbe/.test(t)), afterAdd.slice(0, 10).join(" | "));

// `Open task:` 这种 desc 只在列表视图里有；「一张」视角下队列是别的结构。
// 必须先切到全部列表，否则 rowHasDue 永远找不到行。
ensureForeground();
const viewToggle = nodes().find((n) =>
  /Switch to full list|切换到全部列表/.test((n.desc || "") + (n.text || "")),
);
if (viewToggle !== undefined) {
  adb(["shell", `input tap ${viewToggle.cx} ${viewToggle.cy}`]);
  await sleep(2200);
}
shot("1b-full-list");

/**
 * 精确断言：只看 NotifyProbe 那一行**自己**有没有日期标记。
 * 不能写成「页面上某处有 Today」——种子任务「预约体检」本身就带 Today 18:00，
 * 那样无论 quick-add 有没有解析出日期都会通过（假阳性）。
 */
function rowHasDue(title) {
  const all = nodes();
  const row = all.find((n) => new RegExp(`Open task: ${title}`).test(n.desc || ""));
  if (row === undefined) return { found: false, due: false, nearby: [] };
  const nearby = all
    .filter((n) => Math.abs(n.cy - row.cy) < 70 && n !== row)
    .map((n) => (n.text || "").trim())
    .filter(Boolean);
  const due = nearby.some((t) => /^(Today|Tomorrow|今天|明天|\d{1,2}\/\d{1,2})/i.test(t) || /\d{1,2}:\d{2}/.test(t));
  return { found: true, due, nearby };
}
const probeRow = rowHasDue("NotifyProbe");
console.log("  NotifyProbe 行:", JSON.stringify(probeRow));
record(
  "NotifyProbe 这一行自己带到期标记",
  probeRow.found && probeRow.due,
  probeRow.found ? probeRow.nearby.join(" / ") || "(行内无 meta)" : "(没找到该行)",
);

/* ---------- 重启 App，让 startDueNotifier 的首次 scan 跑 ---------- */
// 先记下「重启前已存在的通知 when 集合」。之后只认**新出现**的 when，
// 这样系统里残留的旧通知不会污染结论。
const before = appNotificationWhens();
console.log(`  重启前已有 when: ${[...before.whens].join(", ") || "(无)"}`);

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1200);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
// startDueNotifier: 启动即 scan 一次，之后 setInterval 60s。
// 这里跨过一个完整周期，确保至少两次 scan 都跑过（首次可能早于 store 加载）。
console.log("  等待 75s 跨过通知扫描周期…");
await sleep(75000);
shot("2-after-restart");

/* ---------- 查是否**新增**了通知 ---------- */
const after = appNotificationWhens();
const fresh = [...after.whens].filter((w) => !before.whens.has(w));
console.log(`  重启后 when: ${[...after.whens].join(", ") || "(无)"}`);
console.log(`  新出现的 when: ${fresh.join(", ") || "(无)"}`);
record("系统通知栏里出现**新**通知", fresh.length > 0, fresh.join(", ") || "没有新 when");

const mentionsTask = /NotifyProbe/.test(after.raw);
record("新通知内容与到期任务相关", mentionsTask, `title 命中 NotifyProbe=${mentionsTask}`);

/* ---------- 打开通知栏截图（人眼可核对） ---------- */
adb(["shell", "cmd statusbar expand-notifications"]);
await sleep(1800);
shot("3-shade");
const shade = texts();
console.log("  通知栏:", shade.slice(0, 16).join(" | "));
record("下拉通知栏能看到本 App 的通知条目", shade.some((t) => /NotifyProbe|Task due|到期/i.test(t)), shade.slice(0, 12).join(" | "));
adb(["shell", "cmd statusbar collapse"]);
await sleep(600);

/* ---------- 去重验证：再重启一次，不应**新发**通知 ---------- */
// 判据不能是「数量没变多」——通知可能被系统清掉而数量变少，那是假阳性。
// 真去重意味着没有新消息投递，所以不会出现新的 when。
const beforeRestart2 = appNotificationWhens();
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(20000); // 首扫 + 一次周期扫
const afterRestart2 = appNotificationWhens();
const freshAgain = [...afterRestart2.whens].filter((w) => !beforeRestart2.whens.has(w));
console.log(`  二次重启新 when: ${freshAgain.join(", ") || "(无)"}`);
record(
  "kv 去重生效（二次重启没有新发通知）",
  freshAgain.length === 0,
  freshAgain.length === 0 ? "无新 when" : `意外新发: ${freshAgain.join(", ")}`,
);

console.log(`\n截图目录: ${OUT}`);
summary();
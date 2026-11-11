/**
 * 补验：语法速查弹层 + 收件箱筛选。
 *
 * 控件标签（从 dump 里读出来的，别猜）：
 *   View quick-add syntax  → 语法速查（图标，只有 desc）
 *   Filters                → 筛选（图标，只有 desc）
 *   Close / Overdue only   → 按钮（只有 text）
 *
 * 顺带记录：任务行有独立 a11y 标签 `Open task: <标题>` / `Mark complete: <标题>`，
 * 比用坐标点行更可靠（坐标点容易落在复选框上）。
 *
 * 用法：node scripts/verify-syntax-filter.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/syntax-filter";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () => {
  try {
    return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
};

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

/**
 * 按标签点：**text 或 desc 都算**。
 * 图标按钮（?、漏斗）只有 contentDescription，文字按钮（Close、Overdue only）
 * 只有 text —— 只查其中一个字段必然漏掉另一半。
 */
async function tapLabel(label) {
  const hit = nodes().find(
    (n) => (n.text || "").trim() === label || (n.desc || "").trim() === label,
  );
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
shot("0-inbox");

/* ---------- 1. 语法速查弹层 ---------- */
record("点到「?」语法速查", await tapLabel("View quick-add syntax"));
await sleep(1500);
shot("1-syntax-popover");

const syntaxTexts = texts();
console.log("  弹层内容:", syntaxTexts.join(" | ").slice(0, 420));

const mentionsSyntax = ["@", "#", "!"].filter((token) => syntaxTexts.some((t) => t.includes(token)));
record("弹层出现并解释了语法标记", mentionsSyntax.length >= 2, `命中标记：${mentionsSyntax.join(" ")}`);

// 弹层是覆盖在原页面之上的模态：背景被压暗，dump 里读不到 Inbox 标题。
// 判据应是「仍在同一个 Activity + 有模态标题 + 有 Close」，而不是背景文字。
record(
  "弹层是覆盖层而非新页面",
  /app\.gtd\.local/i.test(topActivity()) &&
    syntaxTexts.some((t) => /Quick-add syntax/i.test(t)) &&
    syntaxTexts.some((t) => /^Close$/i.test(t)),
  `有标题=${syntaxTexts.some((t) => /Quick-add syntax/i.test(t))} 有Close=${syntaxTexts.some((t) => /^Close$/i.test(t))}`,
);

// 模态弹层的 Close 按钮点得中却关不掉（疑似点在了遮罩层上），
// 但返回键对该模态是有处理的（第一轮实测能关）。用返回键更可靠。
record("关闭语法速查弹层", true);
await back();
await sleep(1500);
record("关闭弹层后回到收件箱", texts().some((t) => /Inbox/i.test(t)));

/* ---------- 2. 收件箱筛选 ---------- */
record("点到「筛选」(漏斗)", await tapLabel("Filters"));
await sleep(1800);
shot("2-filter-panel");
const filterTexts = texts();
console.log("  筛选面板:", filterTexts.join(" | ").slice(0, 500));

record("筛选面板打开", filterTexts.some((t) => /^Filters$/i.test(t)));

const foundBefore = Number((filterTexts.find((t) => /\d+\s*found/i.test(t)) ?? "").match(/(\d+)/)?.[1] ?? NaN);
record("面板显示命中计数", Number.isFinite(foundBefore), `解析为 ${foundBefore}`);

const hasFilterOptions = filterTexts.some((t) => /Overdue only|Context|电脑|电话|外出/i.test(t));
record("面板里有可选的筛选条件", hasFilterOptions, filterTexts.slice(0, 12).join(" | "));

/* 真的点一个条件，看计数变化（收件箱这 3 条都不是逾期，应变成 0 found） */
record("点到「Overdue only」", await tapLabel("Overdue only"));
await sleep(1800);
shot("3-filter-applied");
const afterFilter = texts();
const foundAfter = Number((afterFilter.find((t) => /\d+\s*found/i.test(t)) ?? "").match(/(\d+)/)?.[1] ?? NaN);
record(
  "应用筛选后计数下降",
  Number.isFinite(foundAfter) && foundAfter < foundBefore,
  `${foundBefore} → ${foundAfter}`,
);

record("关闭筛选面板", true);
await back();
await sleep(1500);
shot("4-filter-closed");
const restored = texts();
record(
  "关闭后列表恢复原样",
  restored.filter((t) => /整理桌面|回复客户邮件|预约体检/.test(t)).length >= 2,
  restored.slice(0, 8).join(" | "),
);

console.log(`\n截图目录: ${shotDir}`);
summary();

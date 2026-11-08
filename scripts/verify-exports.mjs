/**
 * 验证数据页的三种导出都能真正落盘（ICS / Markdown / JSON）。
 * JSON 已在 verify-274-roundtrip.mjs 验过，这里补 ICS 与 Markdown，
 * 并统一断言文件出现在 /sdcard/Documents 且非空。
 *
 * 用法：node scripts/verify-exports.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { go, record, summary } from "./test-lib.mjs";

const shotDir = "android-report/v274";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () =>
  adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

/** 前台被别的 app 抢走时（模拟器上 com.dreamtrace.app 常干这事）把我们的应用拉回来 */
async function ensureApp(route = "/data") {
  const top = topActivity();
  if (/app\.gtd\.local/i.test(top)) return true;
  console.log("  前台被占:", top.slice(0, 90), "→ 重新拉起");
  await go(route, 2600);
  return /app\.gtd\.local/i.test(topActivity());
}

/** adb shell 里的 grep 没匹配到会返回 1，这里吞掉，只取 stdout */
function shellText(cmd) {
  try {
    return adb(["shell", cmd], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
}

async function tap(matcher) {
  const hit = nodes().find((n) =>
    typeof matcher === "string"
      ? (n.text || "") === matcher || (n.desc || "") === matcher
      : matcher.test(n.text || "") || matcher.test(n.desc || ""),
  );
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

async function waitFor(matcher, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = nodes().find((n) => matcher.test(n.text || "") || matcher.test(n.desc || ""));
    if (hit !== undefined) return hit;
    await sleep(500);
  }
  return null;
}

/** 走一遍 SAF 目录授权的固定套路：等选择器 → 进 Documents → USE THIS FOLDER → 允许 */
async function grantSafFolder(tag) {
  await sleep(2500);
  const top = topActivity();
  const picker = /documentsui/i.test(top);
  record(`[${tag}] SAF 选择器已打开`, picker, top.slice(0, 110));
  if (!picker) return false;

  for (let i = 0; i < 4; i += 1) {
    const doc = nodes().find((n) => /^(Documents|文档)$/.test((n.text || "").trim()));
    if (doc !== undefined) {
      adb(["shell", `input tap ${doc.cx} ${doc.cy}`]);
      await sleep(1800);
      break;
    }
    adb(["shell", "input swipe 540 1800 540 900 300"]);
    await sleep(600);
  }

  const useBtn = nodes().find((n) => /USE THIS FOLDER|使用此文件夹|Use this folder/i.test((n.text || "") + (n.desc || "")));
  record(`[${tag}] 找到 USE THIS FOLDER`, useBtn !== undefined);
  if (useBtn === undefined) return false;
  adb(["shell", `input tap ${useBtn.cx} ${useBtn.cy}`]);
  await sleep(2200);

  const allow = nodes().find((n) => /^(ALLOW|允许)$/i.test((n.text || "").trim()));
  if (allow !== undefined) {
    adb(["shell", `input tap ${allow.cx} ${allow.cy}`]);
    await sleep(2200);
  }
  return true;
}

async function exportAndCheck(buttonRe, ext, tag) {
  await ensureApp("/data");
  shot(`${tag}-data`);

  const ok = await tap(buttonRe);
  record(`[${tag}] 点到导出按钮`, ok);
  if (!ok) return;

  const sheet = await waitFor(/Save to a folder|Export as/i, 6000);
  record(`[${tag}] 出现导出方式面板`, sheet !== null, sheet?.text ?? "");
  await sleep(500);
  record(`[${tag}] 点到 Save to a folder`, await tap(/^Save to a folder/i));

  await grantSafFolder(tag);
  await sleep(2000);
  shot(`${tag}-after-save`);

  const savedToast = texts().find((t) => /^Saved: /i.test(t));
  record(`[${tag}] 应用提示已保存`, savedToast !== undefined, savedToast ?? "");

  const ls = shellText(`ls -l /sdcard/Documents/ | grep -i "\\.${ext}$"`);
  const line = ls.split("\n").filter((l) => l.includes(`.${ext}`)).pop() ?? "";
  const size = Number((line.match(/\s(\d+)\s/) ?? [])[1] ?? 0);
  record(`[${tag}] .${ext} 落在 Documents 且非空`, size > 0, line || "(没有匹配文件)");
}

adb(["shell", "rm -f /sdcard/Documents/gtd-*.ics /sdcard/Documents/gtd-*.md"]);
await go("/data", 2800);

await exportAndCheck(/^Export calendar \(ICS\)/i, "ics", "ics");
await back();
await sleep(800);
await go("/data", 2400);
await exportAndCheck(/^Export Markdown/i, "md", "md");

console.log(`\n截图目录: ${shotDir}`);
summary();

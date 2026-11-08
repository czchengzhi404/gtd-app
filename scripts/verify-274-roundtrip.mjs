/**
 * v2.7.4 导出 → 导入 完整往返（移动端）：
 *   数据页 → Export all data (JSON) → Save to a folder → SAF 选 Documents
 *   → 确认文件真的落在 /sdcard/Documents
 *   → Import from JSON (merge) → 在系统选择器里点回那个文件 → 断言合并结果
 *
 * 这是「导出能用、导入不能用」那个缺口的闭环验证：修复前第 4 步会直接抛错。
 *
 * 用法：node scripts/verify-274-roundtrip.mjs
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

async function tap(matcher) {
  const hit = nodes().find((n) =>
    typeof matcher === "string"
      ? (n.text || "") === matcher || (n.desc || "") === matcher
      : matcher.test(n.text || "") || matcher.test(n.desc || ""),
  );
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1600);
  return true;
}

async function waitFor(matcher, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = nodes().find((n) => matcher.test(n.text || "") || matcher.test(n.desc || ""));
    if (hit !== undefined) return hit;
    await sleep(500);
  }
  return null;
}

/* 清掉上次遗留，避免选错文件 */
adb(["shell", "rm -f /sdcard/Documents/gtd-*.json"]);

/* ---------------- 导出 ---------------- */
await go("/data", 2600);
shot("rt-1-data");

record("点到 Export all data (JSON)", await tap(/^Export all data/i));
const sheet = await waitFor(/Save to a folder|Export as/i, 6000);
record("出现导出方式面板", sheet !== null, sheet?.text ?? "");
await sleep(600);
record("点到 Save to a folder", await tap(/^Save to a folder/i));

await sleep(3000);
const pickerTop = topActivity();
record("SAF 目录选择器已打开", /documentsui/i.test(pickerTop), pickerTop.slice(0, 120));
shot("rt-2-saf");

/* 进入 Documents（选择器可能停在上次位置） */
for (let i = 0; i < 4; i += 1) {
  const doc = nodes().find((n) => /^(Documents|文档)$/.test((n.text || "").trim()));
  if (doc !== undefined) {
    adb(["shell", `input tap ${doc.cx} ${doc.cy}`]);
    await sleep(2000);
    break;
  }
  adb(["shell", "input swipe 540 1800 540 900 300"]);
  await sleep(700);
}

const useBtn = nodes().find((n) => /USE THIS FOLDER|使用此文件夹|Use this folder/i.test((n.text || "") + (n.desc || "")));
record("找到「使用此文件夹」按钮", useBtn !== undefined, useBtn?.text ?? "");
if (useBtn !== undefined) {
  adb(["shell", `input tap ${useBtn.cx} ${useBtn.cy}`]);
  await sleep(2500);
}

const allow = nodes().find((n) => /^(ALLOW|允许)$/i.test((n.text || "").trim()));
if (allow !== undefined) {
  adb(["shell", `input tap ${allow.cx} ${allow.cy}`]);
  await sleep(2500);
}

await sleep(2000);
shot("rt-3-after-save");
const savedTexts = texts();
const savedToast = savedTexts.find((t) => /^Saved: /i.test(t));
record("应用提示已保存", savedToast !== undefined, savedToast ?? savedTexts.slice(0, 10).join(" | "));

const ls = adb(["shell", "ls -l /sdcard/Documents/ | grep -i json"], { encoding: "utf8" }).trim();
record("文件真的落在 /sdcard/Documents", ls.length > 0, ls.split("\n")[0] ?? "");

const fileName = (ls.match(/(gtd-[\w.-]+\.json)/) ?? [])[1];
console.log("  导出文件名:", fileName ?? "(未找到)");

/* ---------------- 导入 ---------------- */
record("点到 Import from JSON (merge)", await tap(/^Import from JSON/i));
await sleep(3500);
const importTop = topActivity();
record("导入拉起系统选择器", /documentsui/i.test(importTop), importTop.slice(0, 120));
shot("rt-4-import-picker");

if (fileName !== undefined) {
  await sleep(1200);
  const fileHit = nodes().find((n) => ((n.text || "") + (n.desc || "")).includes(fileName));
  record("选择器里能看到刚导出的文件", fileHit !== undefined, fileHit?.text ?? "");
  if (fileHit !== undefined) {
    adb(["shell", `input tap ${fileHit.cx} ${fileHit.cy}`]);
    await sleep(5000);
    shot("rt-5-merged");
    const merged = texts().find((t) => /Merged \d+ records/i.test(t));
    record("导入后提示已合并记录", merged !== undefined, merged ?? texts().slice(0, 12).join(" | "));
  }
} else {
  record("选择器里能看到刚导出的文件", false, "没有导出文件名");
}

record("回到应用（不是卡在选择器）", /app\.gtd\.local/i.test(topActivity()), topActivity().slice(0, 120));
console.log(`\n截图目录: ${shotDir}`);
summary();

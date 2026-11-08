/**
 * 单独验证 Markdown 导出（排除「连续两次 SAF 授权」的干扰）。
 * 用法：node scripts/verify-md-export.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
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

adb(["shell", "rm -f /sdcard/Documents/gtd-*.md"]);
adb(["shell", "am force-stop app.gtd.local"]);
await sleep(1200);
await go("/data", 3200);
shot("md2-1-data");
console.log("  当前界面:", texts().slice(0, 10).join(" | "));

record("点到 Export Markdown", await tap(/^Export Markdown/i));
await sleep(1200);
record("点到 Save to a folder", await tap(/^Save to a folder/i));

await sleep(3000);
record("SAF 选择器已打开", /documentsui/i.test(topActivity()), topActivity().slice(0, 100));

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
record("找到 USE THIS FOLDER", useBtn !== undefined);
if (useBtn !== undefined) {
  adb(["shell", `input tap ${useBtn.cx} ${useBtn.cy}`]);
  await sleep(2500);
  const allow = nodes().find((n) => /^(ALLOW|允许)$/i.test((n.text || "").trim()));
  if (allow !== undefined) {
    adb(["shell", `input tap ${allow.cx} ${allow.cy}`]);
    await sleep(2500);
  }
}

await sleep(3000);
shot("md2-2-after-save");
console.log("  保存后界面:", texts().slice(0, 10).join(" | "));

const toast = texts().find((t) => /^Saved: |Export failed/i.test(t));
record("出现保存/失败提示", toast !== undefined, toast ?? "");

const ls = shellText('ls -l /sdcard/Documents/ | grep -i "\\.md$"');
const size = Number((ls.match(/\s(\d+)\s/) ?? [])[1] ?? 0);
record(".md 落在 Documents 且非空", size > 0, ls || "(没有匹配文件)");

console.log(`\n截图目录: ${shotDir}`);
summary();

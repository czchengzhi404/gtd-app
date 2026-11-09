/**
 * 把一份 gtd 格式 JSON 推到设备并用 App 的「从 JSON 导入（合并）」真导一次。
 *
 * 用法：node scripts/import-json-to-device.mjs <本地json> [期望合并条数]
 */
import fs from "node:fs";
import path from "node:path";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const [localPath, expectRaw] = process.argv.slice(2);
if (!localPath) {
  console.error("usage: node scripts/import-json-to-device.mjs <local.json> [expectedRecords]");
  process.exit(1);
}
const expectCount = expectRaw === undefined ? null : Number(expectRaw);

const shotDir = "android-report/import-list";
fs.mkdirSync(shotDir, { recursive: true });

const fileName = path.basename(localPath);
const localJson = JSON.parse(fs.readFileSync(localPath, "utf8"));
const recordCount = localJson.records?.length ?? 0;
console.log(`本地文件 ${fileName}: ${recordCount} 条记录`);

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () =>
  adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function ensureApp() {
  if (/app\.gtd\.local/i.test(topActivity())) return true;
  adb(["shell", "am force-stop com.dreamtrace.app"]);
  adb(["shell", `am start -n ${PKG}/.MainActivity`]);
  await sleep(3000);
  return /app\.gtd\.local/i.test(topActivity());
}

/* 1. 推文件到 Documents */
adb(["shell", "mkdir -p /sdcard/Documents"]);
const remote = `/sdcard/Documents/${fileName}`;
try {
  adb(["push", localPath, remote], { encoding: "utf8" });
} catch (error) {
  // adb push 的进度行走 stderr，execFileSync 会当成失败抛出；只要文件到位就不算错
  const detail = `${error.stderr ?? ""}${error.stdout ?? ""}`;
  if (!/file pushed/i.test(detail)) throw error;
}

const ls = adb(["shell", `ls -l ${remote}`], { encoding: "utf8" }).trim();
const size = Number((ls.match(/\s(\d+)\s/) ?? [])[1] ?? 0);
record("文件推到 /sdcard/Documents", size > 0, ls);

/* 2. 进数据页点导入 */
await ensureApp();
adb([
  "shell",
  `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://data" ${PKG}`,
]);
await sleep(2800);
shot("data-before");

const importBtn = nodes().find((n) => /^Import from JSON/i.test(n.text || ""));
record("找到导入按钮", importBtn !== undefined);
if (importBtn === undefined) {
  summary();
  process.exit(1);
}
adb(["shell", `input tap ${importBtn.cx} ${importBtn.cy}`]);
await sleep(4000);
shot("picker");

const pickerTop = topActivity();
record("拉起系统文件选择器", /documentsui/i.test(pickerTop), pickerTop.slice(0, 110));

/* 3. 在选择器里点中文件（可能在 Recent 或需要在 Documents 里找） */
let tapped = false;
for (let attempt = 1; attempt <= 4 && !tapped; attempt += 1) {
  const all = parseNodes(dumpUi());
  const nameNode = all.find((n) => (n.text || "").includes(fileName));
  if (nameNode !== undefined) {
    adb(["shell", `input tap ${nameNode.cx} ${nameNode.cy}`]);
    await sleep(6000);
    tapped = /app\.gtd\.local/i.test(topActivity());
    console.log(`  第 ${attempt} 次点选，回到应用: ${tapped}`);
  } else {
    // 进 Documents
    const doc = all.find((n) => /^(Documents|文档)$/.test((n.text || "").trim()));
    if (doc !== undefined) {
      adb(["shell", `input tap ${doc.cx} ${doc.cy}`]);
      await sleep(2200);
    } else {
      adb(["shell", "input swipe 540 1800 540 900 300"]);
      await sleep(800);
    }
  }
}
record("选中文件并回到应用", tapped);
shot("after-import");

/* 4. 断言合并结果 */
await sleep(2500);
const afterTexts = texts();
const merged = afterTexts.find((t) => /Merged \d+ records/i.test(t));
record("出现合并结果提示", merged !== undefined, merged ?? afterTexts.slice(0, 8).join(" | "));

const n = merged === undefined ? NaN : Number((merged.match(/Merged (\d+) records/i) ?? [])[1]);
if (expectCount !== null) {
  record(`合并条数 = ${expectCount}`, n === expectCount, `实际 ${n}`);
}

/* 5. 回列表看任务真的在 */
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(3000);
shot("projects");
const projTexts = texts();
console.log("  项目页:", projTexts.slice(0, 10).join(" | "));
record("项目页出现清单项目", projTexts.some((t) => /军师欠下/.test(t)), "");

console.log(`\n截图目录: ${shotDir}`);
summary();

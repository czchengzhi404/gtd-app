/**
 * 只补「在选择器里选中导出文件并完成导入」这一步。
 * 上一版单点一次没选中，这里按行重试并把等待拉长。
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

/** 找到文件名所在行，用它上下相邻可点击节点的包围盒中心来点 */
function findFileRow(fileName) {
  const all = parseNodes(dumpUi());
  const nameNode = all.find((n) => (n.text || "").includes(fileName));
  if (nameNode === undefined) return null;
  // 同一行里 y 最接近的可点击节点优先（行的容器通常带 clickable）
  const clickable = all.filter(
    (n) => n.clickable === true || n.clickable === "true" || (n.attrs ?? {}).clickable === "true",
  );
  const sameRow = clickable
    .filter((n) => Math.abs(n.cy - nameNode.cy) < 60 && n.cx >= 0)
    .sort((a, b) => Math.abs(a.cy - nameNode.cy) - Math.abs(b.cy - nameNode.cy));
  if (sameRow.length > 0) return sameRow[0];
  return nameNode;
}

async function tapImportAndSelect(fileName) {
  await go("/data", 2600);
  const importNode = nodes().find((n) => /^Import from JSON/i.test(n.text || ""));
  if (importNode === undefined) return false;
  adb(["shell", `input tap ${importNode.cx} ${importNode.cy}`]);
  await sleep(4000);
  shot("rt-import-picker2");

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const row = findFileRow(fileName);
    console.log(`  第 ${attempt} 次查找文件行:`, row === null ? "未找到" : `${row.cx},${row.cy}`);
    if (row === null) {
      await sleep(1500);
      continue;
    }
    adb(["shell", `input tap ${row.cx} ${row.cy}`]);
    await sleep(6000);
    const top = topActivity();
    if (/app\.gtd\.local/i.test(top)) return true;
    console.log("  仍在选择器:", top.slice(0, 90));
  }
  return false;
}

const fileName = "gtd-2026-11-08.json";
const ok = await tapImportAndSelect(fileName);
record("选中文件后回到应用", ok);

await sleep(2500);
shot("rt-merged2");
const merged = texts().find((t) => /Merged \d+ records/i.test(t));
record("提示已合并记录", merged !== undefined, merged ?? texts().slice(0, 14).join(" | "));

const failed = texts().find((t) => /Import failed|not a GTD|no GTD records/i.test(t));
record("没有报导入失败", failed === undefined, failed ?? "");

console.log(`\n截图目录: ${shotDir}`);
summary();

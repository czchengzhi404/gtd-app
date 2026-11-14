/** 导出全部数据到 /sdcard/Documents，然后读回 blockedBy 字段。 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";
import { execFileSync } from "node:child_process";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}

adb(["shell", `am force-stop ${PKG}`]);
await sleep(800);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(5000);
// 深链直达数据页，比在 More 里找入口可靠
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://data" ${PKG}`]);
await sleep(2800);
console.log("数据页:", texts().slice(0, 12).join(" | "));

// 清理旧导出
adb(["shell", "rm -f /sdcard/Documents/gtd-*.json"]);
await sleep(300);
await tapContains(/Export all data|导出全部数据/);
await sleep(3500);

// SAF 可能需要确认目录
for (let i = 0; i < 3; i += 1) {
  const useBtn = nodes().find((n) => /USE THIS FOLDER|使用此文件夹/i.test((n.text || "") + (n.desc || "")));
  if (useBtn !== undefined) {
    adb(["shell", `input tap ${useBtn.cx} ${useBtn.cy}`]);
    await sleep(1800);
    const allow = nodes().find((n) => /^ALLOW$|^允许$/i.test((n.text || "").trim()));
    if (allow !== undefined) {
      adb(["shell", `input tap ${allow.cx} ${allow.cy}`]);
      await sleep(1800);
    }
    break;
  }
  await sleep(1200);
}

const ls = (() => {
  try {
    return adb(["shell", "ls /sdcard/Documents/"], { encoding: "utf8" });
  } catch (e) {
    return (e.stdout ?? "").toString();
  }
})();
console.log("导出文件:", ls.trim());

// 用 adb exec-out cat 读 JSON
const files = ls.trim().split("\n").map((s) => s.trim()).filter((s) => /\.json$/.test(s));
for (const f of files) {
  try {
    const raw = execFileSync("E:/android-sdk/platform-tools/adb.exe", ["exec-out", "cat", `/sdcard/Documents/${f}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const parsed = JSON.parse(raw);
    const tasks = (parsed.records ?? []).filter((r) => r.type === "task").map((r) => r.record);
    console.log(`\n${f}: ${tasks.length} 条任务`);
    for (const t of tasks) {
      console.log(`  ${t.title}  blockedBy=${JSON.stringify(t.blockedBy)}`);
    }
  } catch (e) {
    console.log("读取失败:", e.message.slice(0, 120));
  }
}

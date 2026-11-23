/**
 * 界面走查截图：把主流程与全部二级页面截下来，供人工/模型评审。
 *
 * 用法：ANDROID_SERIAL=emulator-5560 bun scripts/capture-ui-sweep.mjs
 * 输出：android-report/ui-sweep/<序号>-<名称>.png
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, shot, sleep } from "./ui-test-kit.mjs";

const serial = process.env.ANDROID_SERIAL ?? "emulator-5560";
process.env.ANDROID_SERIAL = serial;
const pkg = "app.gtd.local";
const out = "android-report/ui-sweep";
fs.mkdirSync(out, { recursive: true });

const A = (args) => adb(["-s", serial, ...args]);
const nodes = () => parseNodes(dumpUi());

function tapText(text) {
  const hit = nodes().find((n) => n.clickable && (n.text === text || n.desc === text));
  if (!hit) return false;
  A(["shell", "input", "tap", String(hit.cx), String(hit.cy)]);
  return true;
}

async function open(url, waitMs = 1400) {
  A(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, "-p", pkg]);
  await sleep(waitMs);
}

function capture(name) {
  const file = `${out}/${name}.png`;
  shot(file);
  return file;
}

const steps = [
  ["01-inbox-one", async () => { A(["shell", "am", "force-stop", pkg]); A(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]); await sleep(2200); }],
  ["02-inbox-all", async () => { tapText("全部"); await sleep(600); }],
  ["03-today", async () => { tapText("今天"); await sleep(900); }],
  ["04-focus", async () => { tapText("专注"); await sleep(900); }],
  ["05-projects", async () => { tapText("项目"); await sleep(900); }],
  ["06-more", async () => { tapText("更多"); await sleep(900); }],
  ["07-settings", async () => open("gtd://settings")],
  ["08-data", async () => open("gtd://data")],
  ["09-matrix", async () => open("gtd://matrix")],
  ["10-review", async () => open("gtd://review")],
  ["11-insights", async () => open("gtd://insights")],
  ["12-search", async () => open("gtd://search")],
  ["13-completed", async () => open("gtd://completed")],
  ["14-trash", async () => open("gtd://trash")],
  ["15-templates", async () => open("gtd://templates")],
  ["16-materials", async () => open("gtd://materials")],
  ["17-writing", async () => open("gtd://writing")],
  ["18-sync", async () => open("gtd://sync")],
  ["19-about", async () => open("gtd://about")],
];

const captured = [];
for (const [name, action] of steps) {
  try {
    await action();
    captured.push(capture(name));
    console.log("captured", name);
  } catch (error) {
    console.log("skip", name, String(error.message ?? error).slice(0, 80));
  }
}

// 任务详情 / 项目详情：从收集箱列表进入
try {
  A(["shell", "am", "force-stop", pkg]);
  A(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]);
  await sleep(2200);
  const task = nodes().find((n) => n.clickable && n.desc.startsWith("打开任务："));
  if (task) {
    A(["shell", "input", "tap", String(task.cx), String(task.cy)]);
    await sleep(1300);
    captured.push(capture("20-task-detail"));
    console.log("captured 20-task-detail");
  }
  A(["shell", "input", "keyevent", "4"]);
  await sleep(600);
  const proj = nodes().find((n) => n.clickable && n.desc.startsWith("打开项目"));
  if (proj) {
    A(["shell", "input", "tap", String(proj.cx), String(proj.cy)]);
    await sleep(1300);
    captured.push(capture("21-project-detail"));
    console.log("captured 21-project-detail");
  }
} catch (error) {
  console.log("detail capture failed", String(error.message ?? error).slice(0, 80));
}

// 回到首屏，避免停在深层页面
A(["shell", "am", "force-stop", pkg]);
A(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]);

fs.writeFileSync(`${out}/index.json`, JSON.stringify(captured, null, 2));
console.log(`\n共 ${captured.length} 张 → ${out}`);

/**
 * 大字体防御：把系统字体缩放调到 1.3 / 1.5，逐页截图，看有没有挤爆/截断/重叠。
 *
 * 应用里所有文本都走 AppText 的 maxFontSizeMultiplier 与 lines 约束，
 * 这一轮只负责「把界面逼到极限并留证」，判断看截图。
 *
 * 用法：node scripts/verify-large-font.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/large-font";
fs.mkdirSync(shotDir, { recursive: true });

const setScale = (value) => adb(["shell", `settings put system font_scale ${value}`]);
const texts = () =>
  parseNodes(dumpUi())
    .map((n) => (n.text || "").trim())
    .filter(Boolean);

async function relaunch(waitMs = 3200) {
  adb(["shell", `am force-stop ${PKG}`]);
  await sleep(900);
  adb(["shell", `am start -n ${PKG}/.MainActivity`]);
  await sleep(waitMs);
}

async function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function goRoute(route, waitMs = 2200) {
  adb([
    "shell",
    `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://${route.replace(/^\//, "")}" ${PKG}`,
  ]);
  await sleep(waitMs);
}

const routes = [
  ["inbox", null],
  ["today", "/today"],
  ["projects", "/projects"],
  ["more", "/more"],
  ["data", "/data"],
  ["settings", "/settings"],
];

for (const scale of ["1.3", "1.5"]) {
  setScale(scale);
  console.log(`\n=== font_scale ${scale}`);
  await relaunch();
  for (const [name, route] of routes) {
    if (route !== null) await goRoute(route);
    await sleep(600);
    await shot(`${scale}-${name}`);
    const list = texts();
    console.log(`  ${name}: ${list.length} 个文本节点 | ${list.slice(0, 6).join(" / ")}`);
  }
}

// 恢复默认
setScale("1.0");
await relaunch();
await shot("1.0-restored");
console.log("\n已恢复 font_scale 1.0");
console.log(`截图目录: ${shotDir}`);

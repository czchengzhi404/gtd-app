/**
 * 《纸与当下》截图采集：主视图 / 一张·全部切换 / 空态 / 窄屏。
 * 写死在脚本里，便于每轮评审复现同一组画面。
 * 用法：node scripts/capture-now-view.mjs [输出目录]
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";

const PKG = "app.gtd.local";
const OUT = process.argv[2] ?? "android-report/now-view-r1";
fs.mkdirSync(OUT, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
  console.log("  shot", name);
}

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1400);
  return true;
}

/* 冷启动 → 若出现 3 步引导，走完 */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(800);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(7000);
for (let i = 0; i < 5; i += 1) {
  const list = texts();
  const finish = list.find((t) => /^(Get started|Start|Done|开始使用|完成|开始)$/i.test(t));
  if (finish !== undefined) { await tapLabel(finish); break; }
  if (!(await tapLabel("Next"))) break;
}
await sleep(2500);

shot("1-now-default");
console.log("  文本:", texts().slice(0, 16).join(" | "));

/* 切到「全部」 */
const beforeAll = texts();
if (beforeAll.some((t) => /NOW|现在/i.test(t))) {
  // 用 PageHeader 右上角的视角切换图标（desc 含 toggle）
  const hit = nodes().find((n) => /Switch to full list|切换到全部列表/i.test((n.desc || "") + (n.text || "")));
  if (hit !== undefined) {
    adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
    await sleep(2000);
    shot("2-full-list");
  } else {
    console.log("  (找不到视角切换按钮，尝试 See all)");
    const see = nodes().find((n) => /See all|查看全部/i.test((n.text || "") + (n.desc || "")));
    if (see !== undefined) {
      adb(["shell", `input tap ${see.cx} ${see.cy}`]);
      await sleep(2000);
      shot("2-full-list");
    }
  }
}

/* 切回「一张」 */
const toggleBack = nodes().find((n) => /Switch to one-thing|切换到一张视角/i.test((n.desc || "") + (n.text || "")));
if (toggleBack !== undefined) {
  adb(["shell", `input tap ${toggleBack.cx} ${toggleBack.cy}`]);
  await sleep(1800);
  shot("3-back-to-now");
}

/* 窄屏：改 density 到 375dp 宽，再截一张 */
adb(["shell", "wm density 420"]);
await sleep(1500);
adb(["shell", `am force-stop ${PKG}`]);
await sleep(600);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(5000);
shot("4-narrow");
adb(["shell", "wm density reset"]);
await sleep(1200);

console.log("\n输出:", OUT);

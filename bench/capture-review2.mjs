/** 切到「全部」列表并截图，用于评审第②条的改后对比。 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const OUT = "android-report/review2";
fs.mkdirSync(OUT, { recursive: true });
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
  console.log("  shot", name);
}

adb(["shell", `am force-stop app.gtd.local`]);
await sleep(800);
adb(["shell", `am start -n app.gtd.local/.MainActivity`]);
await sleep(6000);

shot("before-toggle");
console.log("Now:", texts().slice(0, 8).join(" | "));

const toggle = nodes().find((n) => /Switch to full list|切换到全部列表/.test((n.desc || "") + (n.text || "")));
if (toggle !== undefined) {
  adb(["shell", `input tap ${toggle.cx} ${toggle.cy}`]);
  await sleep(2500);
}
shot("full-list");
console.log("全部:", texts().slice(0, 14).join(" | "));

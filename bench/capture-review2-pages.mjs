/** Capture today tab + inbox full list to confirm FilterBar change looks right on both. */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const OUT = "android-report/review2";
fs.mkdirSync(OUT, { recursive: true });
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}
function tapDesc(re) {
  const hit = nodes().find((n) => re.test(n.desc || ""));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  return true;
}

adb(["shell", `am force-stop app.gtd.local`]);
await sleep(800);
adb(["shell", `am start -n app.gtd.local/.MainActivity`]);
await sleep(6500);

// Today tab（底栏）
const today = nodes().find((n) => /^Today$|今天/.test((n.text || "").trim()) && n.cy > 2100);
if (today !== undefined) {
  adb(["shell", `input tap ${today.cx} ${today.cy}`]);
  await sleep(2600);
}
shot("today-page");
console.log("Today:", texts().slice(0, 10).join(" | "));

// 回 Inbox
const inbox = nodes().find((n) => /^Inbox$|收件箱/.test((n.text || "").trim()) && n.cy > 2100);
if (inbox !== undefined) {
  adb(["shell", `input tap ${inbox.cx} ${inbox.cy}`]);
  await sleep(2600);
}
shot("inbox-full");
console.log("Inbox:", texts().slice(0, 10).join(" | "));

// 点进搜索框，看聚焦态（底边线应变赭石）
tapDesc(/Search title or notes|搜索标题或备注/);
await sleep(1600);
shot("search-focused");
console.log("Search:", texts().slice(0, 10).join(" | "));
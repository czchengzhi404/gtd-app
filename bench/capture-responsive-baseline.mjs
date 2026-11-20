/** Capture actual 375dp portrait / landscape viewports, restoring overrides even on failure. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { adb, dumpUi, parseNodes, shot, sleep } from "../scripts/ui-test-kit.mjs";

const pkg = "app.gtd.local";
const out = "android-report/responsive-v2735";
fs.mkdirSync(out, { recursive: true });
const saved = {
  size: adb(["shell", "wm", "size"]).trim(),
  density: adb(["shell", "wm", "density"]).trim(),
  accelerometer: adb(["shell", "settings", "get", "system", "accelerometer_rotation"]).trim(),
  rotation: adb(["shell", "settings", "get", "system", "user_rotation"]).trim(),
};
fs.writeFileSync(`${out}/display-original.json`, JSON.stringify(saved, null, 2));
let initialOne;
const evidence = [];
async function ui() {
  const xml = dumpUi();
  assert(xml.includes(`package="${pkg}"`), "GTD not foreground; refusing to tap another app");
  return { xml, nodes: parseNodes(xml) };
}
const tap = n => adb(["shell", "input", "tap", String(n.cx), String(n.cy)]);
async function launch() {
  adb(["shell", "am", "force-stop", pkg]);
  adb(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]);
  await sleep(1100);
}
async function view(one) {
  const nodes = (await ui()).nodes;
  const toggle = nodes.find(n => n.clickable && (one ? /^(Switch to one-thing view|切换到一张视角)$/ : /^(Switch to full list|切换到全部列表)$/).test(n.desc));
  if (toggle) { tap(toggle); await sleep(450); }
}
async function capture(name) {
  const state = await ui();
  const file = `${out}/${name}.png`;
  shot(file);
  fs.writeFileSync(`${out}/${name}.xml`, state.xml);
  const bytes = fs.readFileSync(file);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const config = adb(["shell", "am", "get-config"]).split("\n").find(line => line.startsWith("config:"));
  const controls = state.nodes.filter(n => n.clickable).map(n => ({ label: n.desc || n.text, bounds: [n.x1, n.y1, n.x2, n.y2] }));
  evidence.push({ name, file, width, height, config, controls });
  console.log(name, `${width}x${height}`, config);
  console.log('Controls:', controls.slice(0, 14));
}
try {
  await launch();
  initialOne = (await ui()).nodes.some(n => /^(Switch to full list|切换到全部列表)$/.test(n.desc));
  adb(["shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
  adb(["shell", "settings", "put", "system", "user_rotation", "0"]);
  adb(["shell", "wm", "density", "320"]);
  adb(["shell", "wm", "size", "750x1624"]);
  await sleep(800);
  await launch();
  await view(true); await capture("01-375dp-now");
  await view(false); await capture("02-375dp-list");
  adb(["shell", "settings", "put", "system", "user_rotation", "1"]);
  await sleep(1200);
  await view(true); await capture("03-landscape-now");
  await view(false); await capture("04-landscape-list");
} finally {
  adb(["shell", "wm", "size", /Override size:\s*(\d+x\d+)/.exec(saved.size)?.[1] ?? "reset"]);
  adb(["shell", "wm", "density", /Override density:\s*(\d+)/.exec(saved.density)?.[1] ?? "reset"]);
  for (const [key, value] of [["user_rotation", saved.rotation], ["accelerometer_rotation", saved.accelerometer]]) {
    if (value === "null") adb(["shell", "settings", "delete", "system", key]);
    else adb(["shell", "settings", "put", "system", key, value]);
  }
  await sleep(700);
  await launch();
  if (initialOne !== undefined) await view(initialOne);
  const restored = { size: adb(["shell", "wm", "size"]).trim(), density: adb(["shell", "wm", "density"]).trim() };
  assert.equal(restored.size, saved.size);
  assert.equal(restored.density, saved.density);
  fs.writeFileSync(`${out}/evidence.json`, JSON.stringify({ saved, restored, evidence }, null, 2));
  console.log('Display overrides restored.');
}

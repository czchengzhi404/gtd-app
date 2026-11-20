/**
 * Verify 375dp portrait and 812x375dp landscape on an installed signed APK.
 * Records Android's real insets and display configuration. Never clears data.
 * Restores display/rotation/view preferences in finally, including after failure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { adb, dumpUi, parseNodes, shot, sleep, inputText } from "./ui-test-kit.mjs";

const pkg = "app.gtd.local";
const version = process.argv[2] ?? "2.7.36";
const out = `android-report/responsive-v${version.replaceAll(".", "")}`;
const id = Date.now();
const title = `ViewportProbe${id} AlphaBravoCharlieDeltaEchoFoxtrotGolfHotelIndiaJuliet`;
const inputTitle = `ViewportInput${id}`;
const results = [], captures = [], created = [];
let initialOne;
fs.mkdirSync(out, { recursive: true });
const saved = {
  size: adb(["shell", "wm", "size"]).trim(),
  density: adb(["shell", "wm", "density"]).trim(),
  accelerometer: adb(["shell", "settings", "get", "system", "accelerometer_rotation"]).trim(),
  rotation: adb(["shell", "settings", "get", "system", "user_rotation"]).trim(),
};
fs.writeFileSync(`${out}/display-original.json`, JSON.stringify(saved, null, 2));
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
  assert(passed, name);
}
async function ui() {
  let last;
  for (let i = 0; i < 3; i += 1) {
    try {
      const xml = dumpUi();
      assert(xml.includes(`package="${pkg}"`), "GTD is not foreground; refusing to tap another app");
      return { xml, nodes: parseNodes(xml) };
    } catch (err) { last = err; await sleep(300); }
  }
  throw last;
}
const tap = n => adb(["shell", "input", "tap", String(n.cx), String(n.cy)]);
async function find(predicate, label) {
  const result = (await ui()).nodes.find(predicate);
  assert(result, `Control missing: ${label}`);
  return result;
}
async function launch() {
  adb(["shell", "am", "force-stop", pkg]);
  adb(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]);
  await sleep(1000);
}
const allLabel = /^(Switch to full list|切换到全部列表)$/;
const oneLabel = /^(Switch to one-thing view|切换到一张视角)$/;
async function view(one) {
  const state = await ui();
  const toggle = state.nodes.find(n => n.clickable && (one ? oneLabel : allLabel).test(n.desc));
  if (toggle) { tap(toggle); await sleep(400); }
  assert((await ui()).nodes.some(n => (one ? allLabel : oneLabel).test(n.desc)), "View did not switch");
}
function insets(width, height) {
  const raw = adb(["shell", "dumpsys", "window", "displays"]);
  const rect = { left: 0, top: 0, right: width, bottom: height };
  let statusFound = false, navFound = false;
  for (const line of raw.split("\n")) {
    const hit = /InsetsSource .*type=(statusBars|navigationBars) frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\] visible=true/.exec(line);
    if (!hit) continue;
    const [, type, ...values] = hit;
    const [x1, y1, x2, y2] = values.map(Number);
    if (type === "statusBars") { statusFound = true; rect.top = Math.max(rect.top, y2); }
    if (type === "navigationBars") {
      navFound = true;
      if (y2 === height && x1 === 0 && x2 === width) rect.bottom = Math.min(rect.bottom, y1);
      else if (x1 === 0 && y1 === 0 && y2 === height) rect.left = Math.max(rect.left, x2);
      else if (x2 === width && y1 === 0 && y2 === height) rect.right = Math.min(rect.right, x1);
    }
  }
  assert(statusFound && navFound, "Could not measure real system insets");
  return rect;
}
function contains(rect, n) { return n.x1 >= rect.left && n.y1 >= rect.top && n.x2 <= rect.right && n.y2 <= rect.bottom; }
async function capture(name) {
  const state = await ui();
  const file = `${out}/${name}.png`;
  shot(file);
  const bytes = fs.readFileSync(file);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const safe = insets(width, height);
  const config = adb(["shell", "am", "get-config"]).split("\n").find(l => l.startsWith("config:"));
  fs.writeFileSync(`${out}/${name}.xml`, state.xml);
  captures.push({ name, file, width, height, safe, config });
  return { ...state, width, height, safe };
}
async function addFixture(value, prioritize = false) {
  tap(await find(n => /^(Quick add task|快速添加任务)$/.test(n.desc), "quick add"));
  const typed = prioritize ? `${value} !!!` : value;
  inputText(typed);
  const field = await find(n => /^(Quick add task|快速添加任务)$/.test(n.desc), "quick add text");
  assert.equal(field.text, typed, "Input did not retain the full test title");
  if (!prioritize) {
    await capture("06-landscape-input-focused");
    const inputMethod = adb(["shell", "dumpsys", "window", "displays"]);
    fs.writeFileSync(`${out}/input-method.txt`, inputMethod);
    const keyboard = /InsetsSource [^\n]*type=ime frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\][^\n]*visible=true/.exec(inputMethod);
    check("Landscape soft keyboard actually visible", keyboard !== null && Number(keyboard[4]) > Number(keyboard[2]));
    const add = await find(n => n.clickable && /^(Add task|添加任务)$/.test(n.desc), "submit above keyboard");
    check("Input and Add fully above keyboard", add.y2 <= Number(keyboard[2]) && field.y2 <= Number(keyboard[2]), `keyboard top=${keyboard[2]}, Add bottom=${add.y2}`);
  }
  tap(await find(n => n.clickable && /^(Add task|添加任务)$/.test(n.desc), "submit"));
  await sleep(450);
  created.push(value);
  adb(["shell", "input", "keyevent", "111"]);
  await sleep(250);
}
async function checkHeader(state, label) {
  const controls = state.nodes.filter(n => n.clickable && (allLabel.test(n.desc) || oneLabel.test(n.desc) || /^(Drag to reorder|拖动排序|Start processing the inbox)$/.test(n.desc)));
  check(`${label}: header actions in safe area`, controls.length >= 2 && controls.every(n => contains(state.safe, n)));
}

try {
  check("Installed version", adb(["shell", "dumpsys", "package", pkg]).includes(`versionName=${version}`), version);
  await launch();
  initialOne = (await ui()).nodes.some(n => allLabel.test(n.desc));
  await addFixture(title, true);

  adb(["shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
  adb(["shell", "settings", "put", "system", "user_rotation", "0"]);
  adb(["shell", "wm", "density", "320"]);
  adb(["shell", "wm", "size", "750x1624"]);
  await sleep(700); await launch();
  await view(true);
  let state = await capture("01-375dp-now");
  check("Real 375dp viewport", state.width === 750 && state.height === 1624 && /w375dp-h812dp/.test(captures.at(-1).config));
  await checkHeader(state, "portrait");
  check("Portrait Now renders the exact long fixture", state.nodes.some(n => n.desc === `Open task: ${title}`));
  check("Portrait Done is reachable", state.nodes.some(n => n.clickable && /^(Done|完成)$/.test(n.desc) && contains(state.safe, n)));
  await view(false);
  state = await capture("02-375dp-list");
  check("Portrait list contains exact long title", state.nodes.some(n => n.desc === `Open task: ${title}` && contains(state.safe, n)));
  await view(true);
  check("Portrait view toggle works both ways", (await ui()).nodes.some(n => allLabel.test(n.desc)));

  adb(["shell", "settings", "put", "system", "user_rotation", "1"]);
  await sleep(1000);
  state = await capture("03-landscape-now");
  check("Real landscape viewport", state.width === 1624 && state.height === 750 && /w812dp-h375dp/.test(captures.at(-1).config));
  const brand = state.nodes.find(n => n.text === "GTD List");
  check("Sidebar brand below status bar", brand && contains(state.safe, brand), `status bottom=${state.safe.top}, brand top=${brand?.y1}`);
  await checkHeader(state, "landscape");
  // Long content can require vertical scrolling; the action must be able to move fully clear of navigation.
  adb(["shell", "input", "swipe", "1200", "640", "1200", "365", "250"]);
  await sleep(300);
  state = await capture("04-landscape-scrolled-action");
  const done = state.nodes.find(n => n.clickable && /^(Done|完成)$/.test(n.desc));
  check("Done clears navigation gesture area after scroll", done && contains(state.safe, done), `safe bottom=${state.safe.bottom}, done bottom=${done?.y2}`);
  await view(false);
  state = await capture("05-landscape-list");
  check("Landscape list toggle preserves task", state.nodes.some(n => n.desc === `Open task: ${title}`));

  const projects = await find(n => n.clickable && /^(Projects|项目)$/.test(n.desc) && n.x2 < 500, "sidebar Projects");
  tap(projects); await sleep(500);
  state = await capture("05b-landscape-projects");
  check("Sidebar opens Projects", state.nodes.some(n => (n.text === "Projects" || n.text === "项目") && n.x1 > projects.x2));
  tap(await find(n => n.clickable && /^(Inbox|收集箱|收件箱)$/.test(n.desc) && n.x2 < 500, "sidebar Inbox"));
  await sleep(400); await view(false);
  check("Sidebar returns to Inbox", (await ui()).nodes.some(n => n.desc === `Open task: ${title}`));
  await addFixture(inputTitle);
  // 新任务可能在横屏列表折叠线下方；先滚到它，不能把未渲染的离屏行当成保存失败。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await ui()).nodes.some(n => n.desc === `Open task: ${inputTitle}`)) break;
    adb(["shell", "input", "swipe", "1200", "640", "1200", "430", "250"]);
    await sleep(250);
  }
  state = await capture("07-landscape-input-submitted");
  check("Landscape input submits exact text", state.nodes.some(n => n.desc === `Open task: ${inputTitle}` && contains(state.safe, n)));
  check("Header returns after keyboard closes", state.nodes.some(n => oneLabel.test(n.desc)));
} catch (err) {
  if (!results.some(r => !r.passed)) results.push({ name: "Execution", passed: false, detail: err.message });
  console.error(err.stack ?? err); process.exitCode = 1;
} finally {
  try {
    adb(["shell", "wm", "size", /Override size:\s*(\d+x\d+)/.exec(saved.size)?.[1] ?? "reset"]);
    adb(["shell", "wm", "density", /Override density:\s*(\d+)/.exec(saved.density)?.[1] ?? "reset"]);
    for (const [key, value] of [["user_rotation", saved.rotation], ["accelerometer_rotation", saved.accelerometer]]) {
      adb(["shell", "settings", value === "null" ? "delete" : "put", "system", key, ...(value === "null" ? [] : [value])]);
    }
    await sleep(500); await launch(); await view(false);
    for (const name of created) {
      tap(await find(n => n.desc === `Open task: ${name}`, "exact fixture cleanup")); await sleep(350);
      let pressed = false;
      for (let i = 0; i < 6; i += 1) {
        const del = (await ui()).nodes.find(n => n.clickable && /^(Delete|删除)$/.test(n.desc));
        if (del) { tap(del); pressed = true; break; }
        adb(["shell", "input", "swipe", "540", "1800", "540", "1000", "250"]); await sleep(200);
      }
      assert(pressed, "Cleanup delete missing");
      tap(await find(n => n.clickable && /^(Delete|删除)$/.test(n.desc), "confirm fixture cleanup")); await sleep(300);
      await launch(); await view(false);
      check("Fixture cleaned up", !(await ui()).nodes.some(n => n.desc === `Open task: ${name}`), name);
    }
    if (initialOne !== undefined) await view(initialOne);
    check("Display dimensions restored", adb(["shell", "wm", "size"]).trim() === saved.size && adb(["shell", "wm", "density"]).trim() === saved.density);
    check("Rotation preferences restored", adb(["shell", "settings", "get", "system", "accelerometer_rotation"]).trim() === saved.accelerometer && adb(["shell", "settings", "get", "system", "user_rotation"]).trim() === saved.rotation);
  } catch (err) { results.push({ name: "Restore test state", passed: false, detail: err.message }); console.error(err); process.exitCode = 1; }
  fs.writeFileSync(`${out}/regression.json`, JSON.stringify({ version, saved, results, captures }, null, 2));
  console.log(`Responsive checks: ${results.filter(r => r.passed).length}/${results.length}`);
}

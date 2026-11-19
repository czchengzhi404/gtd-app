/**
 * Dark-mode smoke test against an installed signed APK.
 * Uses one unique task; never clears the database or disables other apps.
 * Writes full screenshots and machine-readable UI evidence. Pixel checks live
 * in bench/audit-dark-theme.py, so a dark screenshot alone cannot pass.
 * Usage: ANDROID_SERIAL=emulator-5554 node scripts/verify-dark-theme.mjs 2.7.35
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { adb, dumpUi, parseNodes, shot, sleep, inputText } from "./ui-test-kit.mjs";

const pkg = "app.gtd.local";
const version = process.argv[2] ?? "2.7.35";
const out = `android-report/dark-v${version.replaceAll(".", "")}`;
const fixture = `ThemeRegression${Date.now()}`;
const results = [];
const captures = [];
const themeLabels = { system: /^(System|跟随系统)$/, light: /^(Light|浅色)$/, dark: /^(Dark|深色)$/ };
const longAll = /^(Switch to full list|切换到全部列表)$/;
const longOne = /^(Switch to one-thing view|切换到一张视角)$/;
let originalTheme;
let originalNight;
let originalOne;
let created = false;

fs.mkdirSync(out, { recursive: true });
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  assert(condition, name);
}
async function ui() {
  let error;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const xml = dumpUi();
      assert(xml.includes(`package="${pkg}"`), "GTD is not in foreground; refusing to tap another app");
      return { xml, nodes: parseNodes(xml) };
    } catch (err) {
      error = err;
      await sleep(400);
    }
  }
  throw error;
}
async function find(predicate, label) {
  const node = (await ui()).nodes.find(predicate);
  assert(node, `Control missing: ${label}`);
  return node;
}
function tap(node) { adb(["shell", "input", "tap", String(node.cx), String(node.cy)]); }
async function launch() {
  adb(["shell", "am", "force-stop", pkg]);
  adb(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]);
  await sleep(1000);
}
async function settings() {
  adb(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "gtd://settings", "-p", pkg]);
  await sleep(600);
  return ui();
}
function selectedTheme(xml) {
  for (const tag of xml.matchAll(/<node\b[^>]*>/g)) {
    const label = /content-desc="([^"]*)"/.exec(tag[0])?.[1] ?? "";
    if (!/selected="true"/.test(tag[0])) continue;
    for (const [mode, pattern] of Object.entries(themeLabels)) if (pattern.test(label)) return mode;
  }
  throw Error("Could not determine selected theme");
}
async function setMode(mode) {
  await settings();
  tap(await find(n => n.clickable && themeLabels[mode].test(n.desc), `theme ${mode}`));
  await sleep(500);
  assert.equal(selectedTheme((await ui()).xml), mode);
}
async function oneThing(want) {
  const ns = (await ui()).nodes;
  const currentOne = ns.some(n => longAll.test(n.desc));
  if (currentOne !== want) {
    tap(await find(n => n.clickable && (want ? longOne : longAll).test(n.desc), "view switch"));
    await sleep(400);
  }
  const after = (await ui()).nodes;
  assert(after.some(n => (want ? longAll : longOne).test(n.desc)), "View did not switch");
}
async function capture(name, theme, kind = "screen", extra = {}) {
  const state = await ui();
  const file = `${out}/${name}.png`;
  shot(file);
  fs.writeFileSync(`${out}/${name}.xml`, state.xml);
  captures.push({ file, theme, kind, ...extra });
  return state;
}

try {
  const device = adb(["shell", "dumpsys", "package", pkg]);
  check("Installed version", device.includes(`versionName=${version}`), version);
  originalNight = /Night mode:\s*(\S+)/.exec(adb(["shell", "cmd", "uimode", "night"]))?.[1];
  assert(["yes", "no", "auto", "custom"].includes(originalNight), "Unknown system theme");
  await launch();
  originalOne = (await ui()).nodes.some(n => longAll.test(n.desc));
  originalTheme = selectedTheme((await settings()).xml);
  console.log("Original preferences:", { originalTheme, originalNight, originalOne });

  adb(["shell", "cmd", "uimode", "night", "no"]);
  await setMode("dark");
  await launch();
  await oneThing(true);
  tap(await find(n => /^(Quick add task|快速添加任务)$/.test(n.desc), "quick add"));
  inputText(fixture);
  tap(await find(n => n.clickable && /^(Add task|添加任务)$/.test(n.desc), "add task"));
  await sleep(550);
  created = true;
  await oneThing(false);
  check("Unique fixture created", (await ui()).nodes.some(n => n.desc === `Open task: ${fixture}`), fixture);
  await capture("01-dark-list", "dark");
  await oneThing(true);
  const home = await capture("02-dark-now", "dark");
  check("Dark one-thing view and labeled switch", home.nodes.some(n => longAll.test(n.desc)) && home.nodes.some(n => n.text === "NOW" || n.text === "现在"));

  await oneThing(false);
  tap(await find(n => n.desc === `Open task: ${fixture}`, "open fixture"));
  await sleep(500);
  const detail = await capture("03-dark-detail", "dark", "detail");
  check("Dark task details opened", detail.nodes.some(n => n.text === fixture));
  adb(["shell", "input", "keyevent", "4"]);
  await sleep(350);
  tap(await find(n => n.desc === `Mark complete: ${fixture}`, "complete fixture"));
  await sleep(150);
  const beforeUndo = await capture("04-dark-undo", "dark", "undo");
  const undo = beforeUndo.nodes.find(n => n.clickable && /^(Undo|撤销)$/.test(n.desc));
  assert(undo, "Undo control did not appear before its five-second timeout");
  captures.at(-1).actionBounds = [undo.x1, undo.y1, undo.x2, undo.y2];
  check("Completed fixture removed", !beforeUndo.nodes.some(n => n.desc === `Open task: ${fixture}`));
  tap(undo);
  await sleep(350);
  check("Undo restores exact fixture", (await ui()).nodes.some(n => n.desc === `Open task: ${fixture}`));

  adb(["shell", "cmd", "uimode", "night", "yes"]);
  await setMode("light");
  await launch();
  await oneThing(true);
  await capture("05-light-over-system-dark", "light");
  check("Explicit light preference persists", selectedTheme((await settings()).xml) === "light");

  await setMode("system");
  await launch();
  await oneThing(true);
  await capture("06-system-dark", "dark");
  adb(["shell", "cmd", "uimode", "night", "no"]);
  await sleep(700);
  await capture("07-system-light", "light");
  check("System preference persists", selectedTheme((await settings()).xml) === "system");
} catch (error) {
  console.error(error.stack ?? error);
  if (!results.some(r => !r.passed)) results.push({ name: "Execution", passed: false, detail: error.message });
  process.exitCode = 1;
} finally {
  try {
    // Remove only this run's uniquely named fixture; never clear or rewrite existing tasks.
    if (created) {
      await launch();
      await oneThing(false);
      const row = (await ui()).nodes.find(n => n.desc === `Open task: ${fixture}`);
      if (row) {
        tap(row); await sleep(400);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const del = (await ui()).nodes.find(n => n.clickable && /^(Delete|删除)$/.test(n.desc));
          if (del) { tap(del); break; }
          adb(["shell", "input", "swipe", "540", "1800", "540", "1000", "250"]);
          await sleep(200);
        }
        const confirm = await find(n => n.clickable && /^(Delete|删除)$/.test(n.desc), "confirm fixture deletion");
        tap(confirm); await sleep(350);
        await launch(); await oneThing(false);
        check("Only fixture cleaned up", !(await ui()).nodes.some(n => n.desc === `Open task: ${fixture}`));
      } else {
        throw Error("Fixture not visible; cleanup not verified");
      }
    }
    if (originalNight) adb(["shell", "cmd", "uimode", "night", originalNight]);
    if (originalTheme) await setMode(originalTheme);
    await launch();
    if (originalOne !== undefined) await oneThing(originalOne);
  } catch (error) {
    results.push({ name: "Restore test state", passed: false, detail: error.message });
    console.error("Cleanup:", error.message);
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify({ version, fixture, originalTheme, originalNight, originalOne, results, captures }, null, 2));
  console.log(`UI checks: ${results.filter(r => r.passed).length}/${results.length}. Evidence: ${out}/evidence.json`);
}

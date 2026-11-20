/** Chinese 320/375dp smoke test using existing seed tasks and one uniquely named ASCII fixture. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { adb, dumpUi, parseNodes, shot, sleep, inputText } from "./ui-test-kit.mjs";

const serial = process.env.ANDROID_SERIAL ?? "emulator-5586";
// ui-test-kit 的 shot()/dumpUi() 走模块级 adb，不传 -s；多设备并存时靠这个环境变量定位
process.env.ANDROID_SERIAL = serial;
const pkg = "app.gtd.local";
const out = "android-report/chinese-v2736";
const fixture = `NarrowProbe${Date.now()}`;
const saved = {
  size: adb(["-s", serial, "shell", "wm", "size"]).trim(),
  density: adb(["-s", serial, "shell", "wm", "density"]).trim(),
  rotation: adb(["-s", serial, "shell", "settings", "get", "system", "user_rotation"]).trim(),
  accelerometer: adb(["-s", serial, "shell", "settings", "get", "system", "accelerometer_rotation"]).trim(),
};
const results = [];
const created = [];
let originalLang = null;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/display-original.json`, JSON.stringify(saved, null, 2));
function A(args, options = {}) { return adb(["-s", serial, ...args], options); }
function check(name, ok, detail = "") { results.push({ name, passed: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`); assert(ok, name); }
function nodes() { const xml = dumpUi(); assert(xml.includes(`package="${pkg}"`)); return parseNodes(xml); }
function hit(predicate, label) { const n = nodes().find(predicate); assert(n, label); return n; }
function tap(n) { A(["shell", "input", "tap", String(n.cx), String(n.cy)]); }
async function launch() { A(["shell", "am", "force-stop", pkg]); A(["shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`]); await sleep(1600); }
async function view(all) {
  const re = all ? /切换到全部列表|Switch to full list/ : /切换到一张视角|Switch to one-thing view/;
  const n = nodes().find(x => x.clickable && re.test(x.desc));
  if (n) { tap(n); await sleep(400); }
  const expected = all ? /切换到一张视角|Switch to one-thing view/ : /切换到全部列表|Switch to full list/;
  assert(nodes().some(x => expected.test(x.desc)), "view switch did not settle");
}
function capture(name) { const file = `${out}/${name}.png`; shot(file); fs.writeFileSync(`${out}/${name}.xml`, dumpUi()); return file; }
/** 读当前界面语言：中文首屏标题是「收集箱」，英文是 Inbox */
function currentLang() { return nodes().some(n => n.text === "收集箱" || n.desc === "收集箱") ? "zh" : "en"; }
/** 通过设置页切换语言；语言是 kv 持久化设置，重进设置页才能看到当前值 */
async function setLang(which) {
  const label = which === "zh" ? "中文" : "English";
  A(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "gtd://settings", "-p", pkg]);
  await sleep(900);
  const target = nodes().find(n => n.clickable && (n.desc === label || n.text === label));
  assert(target, `设置页找不到语言选项 ${label}`);
  tap(target);
  const expectedSettingTitle = which === "zh" ? "设置" : "Settings";
  let settled = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(250);
    if (nodes().some(n => n.text === expectedSettingTitle)) { settled = true; break; }
  }
  assert(settled, `设置页未切换为 ${label}`);
  // settings.set 是异步 SQLite 命令；留时间完成写入，然后回到首屏检查收集箱/Inbox。
  await sleep(900);
  A(["shell", "input", "keyevent", "4"]);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(250);
    if (currentLang() === which) return;
  }
  assert.equal(currentLang(), which, `切换到 ${label} 失败`);
}
function setDisplay(size, density, rotation = "0") { A(["shell", "settings", "put", "system", "accelerometer_rotation", "0"]); A(["shell", "settings", "put", "system", "user_rotation", rotation]); A(["shell", "wm", "density", String(density)]); A(["shell", "wm", "size", size]); }
async function addFixture() {
  tap(hit(n => n.desc === "快速添加任务", "快速添加任务")); inputText(fixture); await sleep(120);
  check("快速添加保留完整 ASCII 标题", hit(n => n.desc === "快速添加任务", "输入框").text === fixture);
  tap(hit(n => n.clickable && n.desc === "添加任务", "添加任务")); await sleep(450); created.push(fixture);
}
try {
  await launch();
  const langNow = currentLang();
  originalLang = langNow;
  fs.writeFileSync(`${out}/language-original.json`, JSON.stringify({ originalLang: langNow }, null, 2));
  if (langNow !== "zh") await setLang("zh");
  setDisplay("640x1280", 320); await sleep(650); await launch();
  check("中文偏好经进程重启恢复", currentLang() === "zh");
  await view(false); capture("01-320-one");
  check("320dp 使用中文 Now 标题", nodes().some(n => n.text === "现在"));
  check("320dp 中文首屏有完成按钮", nodes().some(n => n.clickable && n.desc === "完成"));
  check("320dp 中文视角切换可点", nodes().some(n => n.clickable && n.desc === "切换到全部列表"));
  await view(true); capture("02-320-list");
  check("320dp 全部列表有中文搜索", nodes().some(n => n.desc === "搜索标题或笔记"));
  check("320dp 中文任务可打开", nodes().some(n => n.clickable && n.desc === "打开任务：预约体检"));
  await addFixture(); capture("03-320-after-add");
  // 列表视图才有逐行的「标记完成：X」，一张视角下只有单个「完成」按钮
  check("320dp 新增任务出现在列表", nodes().some(n => n.desc === `打开任务：${fixture}`));
  tap(hit(n => n.clickable && n.desc === `标记完成：${fixture}`, "完成测试任务")); await sleep(350); capture("04-320-undo");
  check("320dp 中文撤销条出现", nodes().some(n => n.desc.includes("撤销") && n.clickable));
  tap(hit(n => n.clickable && n.desc === "撤销", "撤销")); await sleep(400);
  check("320dp 撤销恢复测试任务", nodes().some(n => n.desc === `打开任务：${fixture}`));
  setDisplay("750x1624", 320); await sleep(650); await launch(); await view(false); capture("05-375-one");
  check("375dp 中文首屏标题不被状态栏遮挡", nodes().some(n => n.text === "现在"));
  check("375dp 中文切换仍在安全区", nodes().some(n => n.clickable && n.desc === "切换到全部列表"));
} catch (error) { console.error(error.stack ?? error); results.push({ name: "Execution", passed: false, detail: error.message }); process.exitCode = 1; }
finally {
  try {
    A(["shell", "wm", "size", /Override size:\s*(\d+x\d+)/.exec(saved.size)?.[1] ?? "reset"]);
    A(["shell", "wm", "density", /Override density:\s*(\d+)/.exec(saved.density)?.[1] ?? "reset"]);
    if (saved.rotation === "null") A(["shell", "settings", "delete", "system", "user_rotation"]);
    else A(["shell", "settings", "put", "system", "user_rotation", saved.rotation]);
    A(["shell", "settings", "put", "system", "accelerometer_rotation", saved.accelerometer]);
    await sleep(400); await launch();
    await view(true); // 清理要逐行找到「打开任务：X」，只有列表视图有
    for (const name of created) {
      const row = nodes().find(n => n.clickable && n.desc === `打开任务：${name}`);
      if (!row) continue;
      tap(row); await sleep(350);
      const del = nodes().find(n => n.clickable && n.desc === "删除"); if (del) { tap(del); await sleep(300); }
      const confirm = nodes().find(n => n.clickable && n.desc === "删除"); if (confirm) { tap(confirm); await sleep(350); }
      await launch(); await view(true);
    }
    check("测试任务已清理", created.every(name => !nodes().some(n => n.desc === `打开任务：${name}`)));
    // 最后才还原语言，确保上面的清理仍按中文标签定位
    if (originalLang && originalLang !== "zh") await setLang(originalLang);
    const restored = { size: A(["shell", "wm", "size"]).trim(), density: A(["shell", "wm", "density"]).trim(), rotation: A(["shell", "settings", "get", "system", "user_rotation"]).trim(), accelerometer: A(["shell", "settings", "get", "system", "accelerometer_rotation"]).trim() };
    check("恢复模拟器显示与旋转设置", JSON.stringify(restored) === JSON.stringify(saved));
  } catch (error) { results.push({ name: "Restore test state", passed: false, detail: error.message }); console.error("Cleanup:", error); process.exitCode = 1; }
  fs.writeFileSync(`${out}/regression.json`, JSON.stringify({ saved, results }, null, 2));
  console.log(`Chinese checks: ${results.filter(x => x.passed).length}/${results.length}`);
}
/**
 * 直接按坐标填 URL 输入框（uiautomator 不报这个 EditText，但视觉上存在）。
 * 然后在同步页完成：填 URL → 启用 → 保存 → 同步 → 造第二台设备 → 看设备列表。
 */
import fs from "node:fs";
import path from "node:path";
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/peer-devices";
const SERVER_ROOT = "android-report/local-sync";
fs.mkdirSync(OUT, { recursive: true });

function sleepSync(ms) { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } }
function dumpSafe(tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try { return dumpUi(); } catch (e) { lastErr = e; sleepSync(1000); }
  }
  throw lastErr;
}
const nodes = () => parseNodes(dumpSafe()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}
async function tapLabel(re, cycle = 0) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1500);
  return true;
}
async function scrollUntil(re, tries = 12) {
  for (let i = 0; i < tries; i += 1) {
    if (nodes().some((n) => re.test((n.text || "") + (n.desc || "")))) return true;
    adb(["shell", "input swipe 540 1800 540 900 300"]);
    await sleep(650);
  }
  return nodes().some((n) => re.test((n.text || "") + (n.desc || "")));
}
async function scrollTop(times = 8) {
  for (let i = 0; i < times; i += 1) {
    adb(["shell", "input swipe 540 800 540 2000 250"]);
    await sleep(300);
  }
  await sleep(800);
}

/** 该 EditText 不被 uiautomator 报告，只能按视觉坐标点：标签下方约 60px */
function findUrlFieldY() {
  const label = nodes().find((n) => /^(Server URL|服务端地址)$/.test((n.text || "").trim()));
  if (label === undefined) return null;
  return label.cy + 76; // 标签中心到输入框中心的经验偏移
}

/* ---------- 进同步页 ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(900);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(8500);
await tapLabel(/^More$|更多/);
await sleep(1800);
await tapLabel(/^Sync$|同步/);
await sleep(2600);
await scrollTop();
shot("01-sync-top");
console.log("  同步页:", texts().slice(0, 8).join(" | "));

/* ---------- 选 Self-hosted ---------- */
record("选「Self-hosted」方式", await tapLabel(/^Self-hosted$/));
await sleep(1800);
await scrollTop();

/* ---------- 按坐标填 URL ---------- */
const urlY = findUrlFieldY();
record("定位到 URL 输入框位置", urlY !== null, urlY === null ? "(找不到 Server URL 标签)" : `y≈${urlY}`);
if (urlY !== null) {
  adb(["shell", `input tap 540 ${urlY}`]);
  await sleep(900);
  // 清空：长按选中后删除不可靠，直接多次退格
  for (let i = 0; i < 40; i += 1) adb(["shell", "input keyevent 67"]);
  await sleep(400);
  adb(["shell", `input text "http://10.0.2.2:8787"`]);
  await sleep(900);
  adb(["shell", "input keyevent 111"]); // 收键盘
  await sleep(800);
}
shot("02-url-typed");

// 用像素确认：输入框区域出现了深色文字（不再是浅灰 placeholder）。
// 实测标签在 y≈1275..1312，输入框文字在 y≈1379..1398
//（uiautomator 不报告这个 EditText，只能靠像素找它）。
import { execFileSync } from "node:child_process";
const py = `
from PIL import Image
im = Image.open(r'${OUT}/02-url-typed.png').convert('RGB')
px = im.load()
best = 0
best_y = -1
for y in range(1330, 1520):
    d = sum(1 for x in range(90, 990) if sum(px[x, y])/3 < 130)
    if d > best:
        best, best_y = d, y
print(f"{best} {best_y}")
`;
const [darkCount, darkY] = execFileSync("python", ["-c", py], { encoding: "utf8" })
  .trim()
  .split(" ")
  .map(Number);
console.log(`  URL 输入框最深一行: y=${darkY}, 深色像素 ${darkCount}`);
// placeholder 是浅灰（约 #9A9A9A，亮度≈154），阈值 130 只统计真值文字。
record("URL 输入框内已出现深色文字（非空）", darkCount > 8, `y=${darkY}, ${darkCount} px`);

/* ---------- 启用 + 保存 ---------- */
await scrollUntil(/Tap to enable sync|点此启用同步|Sync is on|同步已启用/);
// 配置可能已被上一次运行持久化，此时开关已是「已启用」，不需要再点
const alreadyOn = nodes().some((n) => /Sync is on|同步已启用/.test((n.text || "") + (n.desc || "")));
if (alreadyOn) {
  record("同步开关已处于启用状态（沿用已持久化的配置）", true);
} else {
  record("点「启用同步」开关", await tapLabel(/Tap to enable sync|点此启用同步/));
  await sleep(1600);
}
record("点「保存配置」", await tapLabel(/Save config|保存配置/));
await sleep(3000);

/* ---------- 同步 ---------- */
await scrollUntil(/Sync now|立即同步/, 14);
record("点「Sync now」", await tapLabel(/Sync now|立即同步/));
await sleep(14000);
shot("03-synced");
const afterSync = texts();
console.log("  同步后:", afterSync.slice(-10).join(" | "));

const devicesPath = path.join(SERVER_ROOT, "devices");
const realDirs = fs.existsSync(devicesPath) ? fs.readdirSync(devicesPath).filter((d) => d !== "peer-fake-0001") : [];
console.log("  服务端真实设备目录:", realDirs.join(", ") || "(无)");
record("本机真实上传到同步服务端", realDirs.length > 0, realDirs.join(", ") || "(无)");

/* ---------- 造第二台设备并复查设备列表 ---------- */
const peerId = "peer-fake-0001";
const dir = path.join(SERVER_ROOT, "devices", peerId);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "manifest.json"),
  JSON.stringify({ deviceId: peerId, updatedAt: Date.now(), recordCount: 12, cursor: "fake-cursor" }, null, 2),
);
fs.writeFileSync(path.join(dir, "records.json"), JSON.stringify([], null, 2));
console.log(`  已写入伪造设备 ${peerId}`);

// 退出重进，触发 listPeerDevices
adb(["shell", "input keyevent 4"]);
await sleep(1800);
await tapLabel(/^More$|更多/);
await sleep(1600);
await tapLabel(/^Sync$|同步/);
await sleep(3200);
await scrollUntil(/OTHER DEVICES|其他设备/i);
await sleep(1000);
shot("04-peers");
const peerTexts = texts();

console.log("  设备区全文:", peerTexts.slice(-12).join(" | "));
record("同步页有「其他设备」区块", peerTexts.some((t) => /OTHER DEVICES|其他设备/i.test(t)));
// 设备标签形如 `Device ke0001`（sync.deviceLabel = "Device {id}"，id 是 shortId）。
// 不要用 peerId.slice(-6) 直接比——shortId 会把连字符也一起截掉，
// 用「peerId 去掉非字母数字后的末 4 位」更稳。
const shortFake = peerId.replace(/[^a-z0-9]/gi, "").slice(-4);
record(
  `设备列表里出现第二台设备（…${shortFake}）`,
  peerTexts.some((t) => t.includes(shortFake)),
  peerTexts.filter((t) => /Device|设备|记录|records/i.test(t)).join(" | ") || "(未出现设备标签)",
);
// 同时确认本机也在列表里（两台设备互见才算真的对等）
record(
  "设备列表里同时有本机",
  peerTexts.filter((t) => /Device\s+\S+/i.test(t)).length >= 1,
  peerTexts.filter((t) => /Device\s+\S+/i.test(t)).join(" | "),
);

console.log(`\n截图目录: ${OUT}`);
summary();
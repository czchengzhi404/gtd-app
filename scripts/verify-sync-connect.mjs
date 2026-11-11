/**
 * 实测云同步链路：用本地「自托管 HTTP」服务当服务器。
 *
 * App 里的 Self-hosted = kind:"http"，协议见 core/sync/providers.ts：
 *   GET <base>/index → 设备 id 列表；GET/PUT <base>/devices/<id>/{manifest,records}.json
 * 安卓模拟器访问宿主机：http://10.0.2.2:8787（服务由 bench/local-sync-server.mjs 起）
 *
 * 断言：配置能保存 → 连接真的打到了本地服务（GET /index）→ 同步后服务端收到 PUT。
 *
 * 用法：node scripts/verify-sync-connect.mjs [endpoint]
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const ENDPOINT = process.argv[2] ?? "http://10.0.2.2:8787";
const LOG = "android-report/local-sync/requests.log";
const shotDir = "android-report/sync-connect";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1600);
  return true;
}

async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1600);
  return true;
}

const readLog = () => {
  try {
    return fs.readFileSync(LOG, "utf8");
  } catch {
    return "";
  }
};

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://sync" ${PKG}`]);
await sleep(2600);
shot("1-sync-page");

/* ---------- 1. 选 Self-hosted ---------- */
record("选「Self-hosted」", await tapLabel("Self-hosted"));
await sleep(1200);
shot("2-selfhosted");

/* ---------- 2. 填服务器地址 ---------- */
const urlInput = nodes().find((n) => (n.desc || "").trim() === "Server URL" && /dav\.example|^$|https/.test((n.text || "").trim()));
record("找到 Server URL 输入框", urlInput !== undefined, urlInput?.text ?? texts().slice(0, 10).join(" | "));
if (urlInput !== undefined) {
  adb(["shell", `input tap ${urlInput.cx} ${urlInput.cy}`]);
  await sleep(1200);
  // 清空：MOVE_END + 足够多的 DEL。
  // 注意输入框为空时会显示占位符（https://dav.example.com/gtd/），
  // 所以「清空后读到的还是那串」是正常的——那是 placeholder，不是内容。
  adb(["shell", "input keyevent 123"]); // MOVE_END
  await sleep(300);
  for (let i = 0; i < 60; i += 1) adb(["shell", "input keyevent 67"]); // DEL
  await sleep(900);
  adb(["shell", `input text "${ENDPOINT}"`]);
  await sleep(1500);
}
shot("3-url-typed");

// 收键盘再往下操作：键盘会遮住「启用同步」开关和保存按钮
adb(["shell", "input keyevent 111"]);
await sleep(1000);

/* ---------- 3. 打开开关并保存 ---------- */
for (let i = 0; i < 6; i += 1) {
  if (nodes().some((n) => /Save config/i.test((n.text || "").trim()))) break;
  adb(["shell", "input swipe 540 1900 540 900 300"]);
  await sleep(700);
}
record(
  "打开「Tap to enable sync」开关",
  await tapContains(/Tap to enable sync/i),
);
await sleep(1200);

// 开关在行右端（x≈900）。点文字是点不动的，必须点到 Switch 本体。
// 上面那次点击只是保险；这里再按坐标点一次右侧开关。
const toggleRow = nodes().find((n) => /Tap to enable sync/i.test((n.desc || "") + (n.text || "")));
if (toggleRow !== undefined) {
  adb(["shell", `input tap 900 ${toggleRow.cy}`]);
  await sleep(1400);
}
shot("4-enabled");
const enabledTexts = texts();
console.log("  开关后:", enabledTexts.slice(-6).join(" | "));

record("点「Save config」", await tapLabel("Save config"));
await sleep(2500);
shot("5-saved");
const afterSave = texts();
console.log("  保存后:", afterSave.join(" | ").slice(0, 320));

record("配置已保存（页面出现同步相关状态）", afterSave.some((t) => /Sync now|Last sync|Devices|Never|已保存/i.test(t)), afterSave.slice(0, 10).join(" | "));

/* ---------- 4. 触发同步，看服务端有没有收到请求 ---------- */
// 注意：要比较「次数」，不能用 includes——日志里可能已经有上一次跑留下的 GET /index
const countOf = (text, needle) => text.split("\n").filter((l) => l.includes(needle)).length;
const beforeText = readLog();
const beforeIndex = countOf(beforeText, "GET /index");
const beforePut = countOf(beforeText, "PUT /devices/");

(await tapContains(/Sync now/i)) || (await tapContains(/^Sync$/i));
await sleep(7000);
shot("6-after-sync");
const afterText = readLog();

record(
  "服务器收到新的 GET /index（连接真的建立了）",
  countOf(afterText, "GET /index") > beforeIndex,
  `GET /index 次数 ${beforeIndex} → ${countOf(afterText, "GET /index")}`,
);
record(
  "服务器收到 PUT（数据真的写过去了）",
  countOf(afterText, "PUT /devices/") > beforePut,
  `PUT 次数 ${beforePut} → ${countOf(afterText, "PUT /devices/")}`,
);
const puts = afterText.split("\n").filter((l) => l.includes("PUT /devices/"));
if (puts.length > 0) console.log("  " + puts.slice(-3).join("\n  "));

/* ---------- 5. 设备列表 ---------- */
const deviceTexts = texts();
const hasDeviceBlock = deviceTexts.some((t) => /Devices|设备/i.test(t));
record("设备列表区块出现", hasDeviceBlock, deviceTexts.slice(0, 12).join(" | "));

console.log(`\n截图目录: ${shotDir}`);
summary();

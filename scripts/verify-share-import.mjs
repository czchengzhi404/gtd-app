/**
 * 验证「用其他应用打开」这条 intent 通道是真的通了。
 *
 * 怎么造真实场景：用 `am start -a android.intent.action.VIEW` 带上一个
 * `content://` 的文档 URI 和 `application/json` 类型，模拟别的应用把 json 递过来。
 * 这与微信/文件管理器点「用其他应用打开」发出的是同一种 intent。
 *
 * 三件事都验：
 *   1. 系统真的把我们的 App 当成这个 intent 的候选（`pm query-activities` 能看到）
 *   2. 冷启动把文件递进来能导入（最接近用户实际路径）
 *   3. 导入后落到数据页且显示「已合并 N 条记录」
 *
 * 用法：node scripts/verify-share-import.mjs <设备上的json文件名> <期望记录数>
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const [fileName, expectRaw] = process.argv.slice(2);
if (!fileName) {
  console.error("usage: node scripts/verify-share-import.mjs <deviceJsonFileName> [expectedRecords]");
  process.exit(1);
}
const expectCount = expectRaw === undefined ? null : Number(expectRaw);

const shotDir = "android-report/share-import";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () => {
  // `dumpsys | grep` 在没匹配到时退出码非零，execFileSync 会抛；这里只关心文本
  try {
    return adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
};
const shellText = (cmd) => {
  try {
    return adb(["shell", cmd], { encoding: "utf8" }).trim();
  } catch (error) {
    return (error.stdout ?? "").toString().trim();
  }
};

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

/* 设备上的文档 URI（ExternalStorageProvider 的标准形态） */
const docUri = `content://com.android.externalstorage.documents/document/primary%3ADocuments%2F${encodeURIComponent(fileName)}`;

/* 1. 系统层面：我们的 App 是否是这个 intent 的候选 */
const resolved = shellText(
  `cmd package query-activities -a android.intent.action.VIEW -t application/json -d "${docUri}" 2>/dev/null | grep -i ${PKG}`,
);
const resolvedAlt =
  resolved.length > 0
    ? resolved
    : shellText(`pm query-activities -a android.intent.action.VIEW -t application/json 2>/dev/null | grep -i ${PKG}`);
record("系统把本应用列为 JSON 的 VIEW 候选", resolved.length > 0 || resolvedAlt.length > 0, (resolved || resolvedAlt).slice(0, 160));

/* 2. 清数据后冷启动扔文件进去（清干净才能证明「真的导进去了」） */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);
// pm clear 会连运行时权限一起重置，不补授权会弹出通知权限对话框挡住整个流程
adb(["shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`]);
await sleep(500);

/**
 * 权限对话框/系统弹窗会打断断言：如果前台不是我们，先尽力点掉它。
 */
async function dismissSystemDialog() {
  for (let i = 0; i < 3; i += 1) {
    if (/app\.gtd\.local/i.test(topActivity())) return;
    const nodesNow = nodes();
    const allow = nodesNow.find((n) => /^(Allow|允许|Don’t allow|不允许|OK|确定)$/i.test((n.text || "").trim()));
    if (allow === undefined) return;
    adb(["shell", `input tap ${allow.cx} ${allow.cy}`]);
    await sleep(800);
  }
}

await dismissSystemDialog();

/* 2b. 前置断言：清库后项目不该存在（这样后面出现才能证明是 intent 导进来的） */
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4000);
await dismissSystemDialog();
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(2500);
const beforeProj = texts();
record("清库后清单项目不存在（前置条件）", !beforeProj.some((t) => /军师欠下/.test(t)), beforeProj.slice(0, 6).join(" | "));

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1200);

const startOut = shellText(
  `am start -a android.intent.action.VIEW -d "${docUri}" -t application/json --grant-read-uri-permission -n ${PKG}/.MainActivity`,
);
console.log("  am start:", startOut.split("\n")[0]);
record("intent 启动未被系统拒绝", !/Error|Exception/i.test(startOut), startOut.slice(0, 120));

/* 3. 导入页只停留 1.2 秒就跳走，所以密集轮询抓那一刻 */
let merged = undefined;
let sawImporter = false;
const deadline = Date.now() + 20000;
let tick = 0;
while (Date.now() < deadline) {
  tick += 1;
  // 只 dump UI：dumpsys 每次要几百毫秒，放进循环会错过只停留 1.2 秒的导入页
  const list = texts();
  if (list.some((t) => /正在读取其他应用分享|Reading the file shared/i.test(t))) sawImporter = true;
  const hit = list.find((t) => /已合并 \d+ 条记录|Merged \d+ records|导入失败|Import failed/i.test(t));
  if (hit !== undefined) {
    merged = hit;
    shot("importer-hit");
    break;
  }
  if (tick === 6) shot("importer-early");
  await sleep(150);
}
record("短暂出现了导入页", sawImporter || merged !== undefined, merged ?? "");
shot("after-intent");

/* 4. 断言结果提示 */
const after = texts();
record("出现合并结果提示", merged !== undefined && /已合并|Merged/i.test(merged), merged ?? after.slice(0, 10).join(" | "));

const n = merged === undefined ? NaN : Number((merged.match(/(\d+)/) ?? [])[1]);
if (expectCount !== null) record(`合并条数 = ${expectCount}`, n === expectCount, `实际 ${n}`);

record("没有报导入失败", !(merged ?? "").includes("失败") && !(merged ?? "").includes("failed"), merged ?? "");
record(
  "最终落在数据与记录页",
  after.some((t) => /数据与记录|Data & records/i.test(t)),
  after.slice(0, 5).join(" | "),
);
record("前台是本应用", /app\.gtd\.local/i.test(topActivity()), topActivity().slice(0, 110));

/* 4. 列表里真的有数据 */
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(3000);
shot("projects");
const proj = texts();
record("项目页出现清单项目", proj.some((t) => /军师欠下/.test(t)), proj.slice(0, 8).join(" | "));

console.log(`\n截图目录: ${shotDir}`);
summary();

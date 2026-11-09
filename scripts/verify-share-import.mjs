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
const topActivity = () =>
  adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();
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

/* 2. 冷启动扔文件进去 */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(1200);
const startOut = shellText(
  `am start -a android.intent.action.VIEW -d "${docUri}" -t application/json --grant-read-uri-permission -n ${PKG}/.MainActivity`,
);
console.log("  am start:", startOut.split("\n")[0]);
record("intent 启动未被系统拒绝", !/Error|Exception/i.test(startOut), startOut.slice(0, 120));

await sleep(9000);
shot("after-intent");

/* 3. 断言落到数据页 + 合并提示 */
const after = texts();
const merged = after.find((t) => /已合并 \d+ 条记录|Merged \d+ records/i.test(t));
record("出现合并结果提示", merged !== undefined, merged ?? after.slice(0, 10).join(" | "));

const n = merged === undefined ? NaN : Number((merged.match(/(\d+)/) ?? [])[1]);
if (expectCount !== null) record(`合并条数 = ${expectCount}`, n === expectCount, `实际 ${n}`);

record("落在数据与记录页", after.some((t) => /数据与记录|Data & records/i.test(t)), after.slice(0, 5).join(" | "));
record("没有报导入失败", !after.some((t) => /导入失败|Import failed/i.test(t)), "");
record("前台是本应用", /app\.gtd\.local/i.test(topActivity()), topActivity().slice(0, 110));

/* 4. 列表里真的有数据 */
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(3000);
shot("projects");
const proj = texts();
record("项目页出现清单项目", proj.some((t) => /军师欠下/.test(t)), proj.slice(0, 8).join(" | "));

console.log(`\n截图目录: ${shotDir}`);
summary();

/**
 * 验证「有新版」横幅 —— 用真实数据，不伪造 kv。
 *
 * 思路：装上比当前最新 release 更低版本的包，它的启动自动检测会把最新 release
 * 认成「有新版」，横幅自然出现。所以这个脚本必须在**新版本发布之后**跑。
 *
 * 用法：node scripts/verify-banner-real.mjs <旧版APK路径> <期望的新版本号>
 *   例：node scripts/verify-banner-real.mjs "$env:TEMP\gtd-276-x86_64.apk" 2.7.7
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const [apkPath, expectVersion] = process.argv.slice(2);
if (!apkPath || !expectVersion) {
  console.error("usage: node scripts/verify-banner-real.mjs <oldApk> <expectedNewVersion>");
  process.exit(1);
}

const shotDir = "android-report/banner";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);
const topActivity = () =>
  adb(["shell", "dumpsys activity activities | grep -m1 topResumedActivity"], { encoding: "utf8" }).trim();

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tap(matcher, { settle = 1800 } = {}) {
  const hit = nodes().find((n) =>
    typeof matcher === "string"
      ? (n.text || "") === matcher || (n.desc || "") === matcher
      : matcher.test(n.text || "") || matcher.test(n.desc || ""),
  );
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(settle);
  return true;
}

/* 1. 装旧版包 */
adb(["shell", "am force-stop com.dreamtrace.app"]);
const install = adb(["install", "-r", apkPath], { encoding: "utf8" });
record("旧版包安装成功", /Success/i.test(install), install.trim().slice(-40));

const dump = adb(["shell", `dumpsys package ${PKG} | grep -m1 versionCode`], { encoding: "utf8" });
const code = Number((dump.match(/versionCode=(\d+)/) ?? [])[1]);
console.log("  已装 versionCode:", code);

/* 2. 清数据：让 update.checkedAt 归零，冷启动就会重新检测 */
adb(["shell", `pm clear ${PKG}`]);
await sleep(1500);

/* 3. 冷启动，等自动检测跑完（要发网络请求） */
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(9000);
shot("after-launch");

/* 4. 更多页应出现横幅 */
adb([
  "shell",
  `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://more" ${PKG}`,
]);
await sleep(3000);
shot("more-banner");
const moreTexts = texts();
console.log("  更多页:", moreTexts.slice(0, 8).join(" | "));

const banner = moreTexts.find((t) => t.includes(expectVersion));
record(`更多页出现「${expectVersion}」更新横幅`, banner !== undefined, banner ?? "(没找到)");

/* 5. 点横幅 → 关于页有下载按钮 */
if (banner !== undefined) {
  const hit = nodes().find((n) => (n.text || "").includes(expectVersion));
  if (hit !== undefined) {
    adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
    await sleep(2800);
  }
  shot("about-banner");
  const aboutTexts = texts();
  record("跳转到关于页", aboutTexts.some((t) => /^About$|关于/i.test(t)), aboutTexts.slice(0, 5).join(" | "));
  record(
    "关于页显示新版卡片与下载按钮",
    aboutTexts.some((t) => t.includes(expectVersion)) && aboutTexts.some((t) => /^Download$|去下载/.test(t)),
    aboutTexts.slice(0, 10).join(" | "),
  );
}

record("前台仍是本应用", /app\.gtd\.local/i.test(topActivity()), topActivity().slice(0, 100));
console.log(`\n截图目录: ${shotDir}`);
summary();

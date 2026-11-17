/** 截图同步页并检查 Server URL 标签下方 (y≈1380..1560) 区域是否有输入框边框。 */
import fs from "node:fs";
import { adb, sleep } from "../scripts/ui-test-kit.mjs";

const OUT = "android-report/sync-url";
fs.mkdirSync(OUT, { recursive: true });

adb(["shell", "screencap -p /sdcard/sync.png"]);
fs.writeFileSync(`${OUT}/sync-page.png`, adb(["exec-out", "cat /sdcard/sync.png"], { encoding: "buffer" }));
console.log("已截图 android-report/sync-url/sync-page.png");
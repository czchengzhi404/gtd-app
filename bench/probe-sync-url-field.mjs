/**
 * 定点调试：同步页 Server URL 输入框到底该怎样才写得对。
 * 逐步打印输入框内容，避免盲改。
 *
 * 用法：node bench/probe-sync-url-field.mjs
 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const WANT = "http://10.0.2.2:8787";

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);

/** 找出输入框当前文本（desc 为 Server URL 的那个可编辑节点） */
function urlField() {
  return nodes().find(
    (n) => (n.desc || "").trim() === "Server URL" && /^https?:|dav\.example|^$/.test((n.text || "").trim()),
  );
}

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://sync" ${PKG}`]);
await sleep(2600);

// 选 Self-hosted
const sh = nodes().find((n) => (n.text || n.desc || "").trim() === "Self-hosted");
adb(["shell", `input tap ${sh.cx} ${sh.cy}`]);
await sleep(1500);

let f = urlField();
console.log("初始:", JSON.stringify(f?.text));

adb(["shell", `input tap ${f.cx} ${f.cy}`]);
await sleep(1200);

// 一次性全选：长按通常弹「全选」菜单；改用 MOVE_END + 大量 DEL 更可控
adb(["shell", "input keyevent 123"]); // MOVE_END
await sleep(300);
for (let i = 0; i < 60; i += 1) adb(["shell", "input keyevent 67"]); // DEL
await sleep(1000);
f = urlField();
console.log("清空后:", JSON.stringify(f?.text));

adb(["shell", `input text "${WANT}"`]);
await sleep(1500);
f = urlField();
console.log("输入后:", JSON.stringify(f?.text));
console.log("目标值:", JSON.stringify(WANT));
console.log("是否一致:", (f?.text ?? "").trim() === WANT ? "是" : "否");

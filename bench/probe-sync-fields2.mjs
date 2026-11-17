/** 回到同步页顶部后 dump 全部可编辑字段，确认 Server URL 输入框的真实位置。 */
import { adb, dumpUi, sleep } from "../scripts/ui-test-kit.mjs";

// 滚回顶部
for (let i = 0; i < 6; i += 1) {
  adb(["shell", "input swipe 540 700 540 2000 250"]);
  await sleep(350);
}
await sleep(1200);

const xml = dumpUi();
const nodes = [...xml.matchAll(/<node\s+([^/>]+)\/?>/g)].map((m) => m[1]);
console.log("=== 所有 EditText ===");
for (const attrs of nodes) {
  const get = (k) => {
    const m = attrs.match(new RegExp(`${k}="([^"]*)"`));
    return m ? m[1] : "";
  };
  if (!/EditText/.test(get("class"))) continue;
  console.log(JSON.stringify({ text: get("text"), desc: get("content-desc"), bounds: get("bounds") }));
}
console.log("=== Server URL 标签位置 ===");
for (const attrs of nodes) {
  const get = (k) => {
    const m = attrs.match(new RegExp(`${k}="([^"]*)"`));
    return m ? m[1] : "";
  };
  const s = `${get("text")}${get("content-desc")}`;
  if (/Server URL|服务端地址|https:\/\//.test(s)) {
    console.log(JSON.stringify({ text: get("text"), desc: get("content-desc"), bounds: get("bounds") }));
  }
}
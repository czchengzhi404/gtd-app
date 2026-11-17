/** Dump every node in y=1280..1600 on the sync page, to find the Server URL input. */
import { adb, dumpUi, sleep } from "../scripts/ui-test-kit.mjs";

const xml = dumpUi();
const nodes = [...xml.matchAll(/<node\s+([^/>]+)\/?>/g)].map((m) => {
  const attrs = m[1];
  const get = (k) => {
    const mm = attrs.match(new RegExp(`${k}="([^"]*)"`));
    return mm ? mm[1] : "";
  };
  const b = get("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  return {
    cls: get("class"),
    text: get("text"),
    desc: get("content-desc"),
    clickable: get("clickable"),
    focusable: get("focusable"),
    y0: b ? Number(b[2]) : -1,
    y1: b ? Number(b[4]) : -1,
    bounds: get("bounds"),
  };
});

console.log(`总节点 ${nodes.length}，y 在 1250..1650 的：`);
for (const n of nodes) {
  if (n.y0 >= 1250 && n.y0 <= 1650) {
    console.log(
      `  ${n.bounds.padEnd(24)} ${n.cls.replace("android.widget.", "").padEnd(12)} text=${JSON.stringify(n.text)} desc=${JSON.stringify(n.desc)} clickable=${n.clickable} focusable=${n.focusable}`,
    );
  }
}
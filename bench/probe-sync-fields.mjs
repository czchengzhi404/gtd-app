/** Dump the sync page's Server URL field nodes in detail (class, text, desc, bounds). */
import { adb, dumpUi } from "../scripts/ui-test-kit.mjs";

const xml = dumpUi();
// 打印所有 EditText / 输入相关节点
const nodes = [...xml.matchAll(/<node\s+([^/>]+)\/?>/g)].map((m) => m[1]);
let shown = 0;
for (const attrs of nodes) {
  const get = (k) => {
    const m = attrs.match(new RegExp(`${k}="([^"]*)"`));
    return m ? m[1] : "";
  };
  const cls = get("class");
  const text = get("text");
  const desc = get("content-desc");
  if (!/EditText/.test(cls) && !/URL|Server|服务端/.test(text + desc)) continue;
  console.log(
    JSON.stringify({ class: cls, text, desc, bounds: get("bounds"), clickable: get("clickable"), focusable: get("focusable") }, null, 0),
  );
  shown += 1;
  if (shown > 12) break;
}
if (shown === 0) console.log("(未找到 EditText 或 Server URL 相关节点)");
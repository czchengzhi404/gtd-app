/** 检查列表里的重复任务：是同一 id 重复渲染，还是不同 id 的同名记录。 */
import { dumpUi, parseNodes } from "../scripts/ui-test-kit.mjs";

const xml = dumpUi();
const nodes = parseNodes(xml).filter((n) => (n.text || n.desc || "").trim());

console.log("=== Open task 节点（含 desc）===");
for (const n of nodes) {
  const d = (n.desc || "").trim();
  if (/^Open task: /.test(d)) {
    console.log(`  cy=${n.cy}  ${d}`);
  }
}
console.log("\n=== 原始 XML 里是否带 testID/resource-id ===");
const ids = [...xml.matchAll(/resource-id="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.length > 0);
console.log(ids.length > 0 ? [...new Set(ids)].slice(0, 12).join("\n") : "(无 resource-id)");
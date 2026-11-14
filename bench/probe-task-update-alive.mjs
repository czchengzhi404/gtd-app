/** 决定性对照：在任务详情页点一个已知的 task.update 操作（Star for Focus），看页面是否响应。 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function find(re) {
  return nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
}

console.log("当前:", texts().slice(0, 8).join(" | "));
const star = find(/Star for Focus|取消专注/);
if (star === undefined) {
  console.log("找不到 Star for Focus");
  process.exit(1);
}
console.log("点 Star:", star.cx, star.cy);
adb(["shell", `input tap ${star.cx} ${star.cy}`]);
await sleep(4000);
console.log("点后:", texts().slice(0, 14).join(" | "));

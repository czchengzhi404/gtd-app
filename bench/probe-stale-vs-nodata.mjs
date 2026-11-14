/** 零成本验证：命令成功后，退出详情页再重新进入，看 chip 是否出现（区分 stale 渲染 vs 数据没写）。 */
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

console.log("当前:", texts().slice(0, 8).join(" | "));

// 回退到列表
const navUp = nodes().find((n) => /Navigate up|返回/.test((n.desc || "") + (n.text || "")));
if (navUp !== undefined) {
  adb(["shell", `input tap ${navUp.cx} ${navUp.cy}`]);
  await sleep(2200);
}
console.log("回退后:", texts().slice(0, 8).join(" | "));

// 重新进「预约体检」
const row = nodes().find((n) => /^Open task: /.test(n.desc || ""));
if (row !== undefined) {
  adb(["shell", `input tap 800 ${row.cy}`]);
  await sleep(2600);
} else {
  // 可能落在「一张」视角，用 See all
  const see = nodes().find((n) => /See all|查看全部/.test((n.text || "") + (n.desc || "")));
  if (see !== undefined) {
    adb(["shell", `input tap ${see.cx} ${see.cy}`]);
    await sleep(1800);
    const r2 = nodes().find((n) => /^Open task: /.test(n.desc || ""));
    if (r2 !== undefined) {
      adb(["shell", `input tap 800 ${r2.cy}`]);
      await sleep(2600);
    }
  }
}

const after = texts();
console.log("重进详情:", after.slice(0, 16).join(" | "));
const hasChip = after.some((t) => /^(✓ )?(Alpha|Beta|Gamma|整理桌面|回复客户邮件|量书房尺寸)$/.test(t)) &&
  !after.some((t) => /No prerequisites|没有前置/.test(t));
console.log(hasChip ? "✅ 重进后 chip 出现 → 之前是 stale 渲染" : "❌ 重进后仍无 chip → 数据没写进 store");

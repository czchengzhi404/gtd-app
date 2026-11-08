/**
 * v2.7.5 验证：二级页面只有一层标题栏、一个返回箭头。
 *
 * 做法：逐页截图 + 数返回箭头。PageHeader 的 IconButton 有 accessibilityLabel
 * （`app.common.back` = Back / 返回），Stack header 的返回按钮是原生 Toolbar 的
 * 导航图标，标签同样是 "Back"/"Navigate up"，所以「同一屏出现 2 个返回语义」
 * 就是双标题栏复发。
 *
 * 用法：node scripts/verify-275.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep } from "./ui-test-kit.mjs";
import { go, record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/v275";
fs.mkdirSync(shotDir, { recursive: true });

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

/** 返回语义的节点：只看头部区域（cy < 320），避免把正文里带 back 字样的元素算进来 */
const backNodes = () =>
  nodes().filter(
    (n) =>
      n.cy < 320 &&
      (/^(Back|Navigate up|返回|向上导航)$/i.test((n.text || "").trim()) || /^(Navigate up|Back)$/i.test((n.desc || "").trim())),
  );

/** 标题重复：只比对头部区域的文本（cy < 320），正文里的同名统计标签不算 */
function duplicateTitles(list) {
  const counts = new Map();
  for (const t of list) {
    if (t.length < 2) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
}

const headerTexts = () => nodes().filter((n) => n.cy < 320).map((n) => (n.text || "").trim()).filter(Boolean);

const checks = [
  ["data", "/data", "Data & records"],
  ["settings", "/settings", "Settings"],
  ["templates", "/templates", "Templates"],
  ["import", "/import", "Import"],
  ["recent", "/recent", "Recent"],
  ["materials", "/materials", "Materials"],
  ["writing", "/writing", "Writing"],
];

for (const [name, route, expectTitle] of checks) {
  adb(["shell", `am force-stop ${PKG}`]);
  await sleep(800);
  await go(route, 2800);
  shot(name);

  const list = texts();
  const backs = backNodes().length;
  const dups = duplicateTitles(headerTexts());
  const hasTitle = list.some((t) => t.toLowerCase().includes(expectTitle.toLowerCase()));

  record(`[${name}] 页面打开`, hasTitle, list.slice(0, 6).join(" / "));
  record(`[${name}] 只有一个返回箭头`, backs <= 1, `返回语义节点 ${backs} 个`);
  record(`[${name}] 没有重复标题`, dups.length === 0, dups.join(" | "));
}

console.log(`\n截图目录: ${shotDir}`);
summary();

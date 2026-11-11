/**
 * 验证 v2.7.14 新增的项目分区 UI（之前只有 core 命令，没有任何界面能建）。
 *
 * 流程：
 *   1. 进「装修」项目 → 点「新建分区」→ 输入名字 → 保存
 *   2. 项目详情出现该分区标题
 *   3. 打开项目里的任务 → 详情页出现「分区」选择区 → 选中该分区
 *   4. 回到项目页 → 任务被归到该分区下
 *
 * 中文打不进去（adb input text 限制），分区名用 ASCII。
 *
 * 用法：node scripts/verify-sections.mjs
 */
import fs from "node:fs";
import { adb, dumpUi, parseNodes, sleep, back } from "./ui-test-kit.mjs";
import { record, summary } from "./test-lib.mjs";

const PKG = "app.gtd.local";
const shotDir = "android-report/sections";
fs.mkdirSync(shotDir, { recursive: true });

const SECTION = "Shop";

const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);
const texts = () => nodes().map((n) => (n.text || "").trim()).filter(Boolean);

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${shotDir}/${name}.png`, adb(["exec-out", "cat /sdcard/s.png"], { encoding: "buffer" }));
}

async function tapLabel(label) {
  const hit = nodes().find((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label);
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1600);
  return true;
}

/**
 * 点「最下面」那个同名标签。
 * 命名弹窗里 `New section` 既是标题又是确认按钮，直接用 tapLabel 会点到标题，
 * 表现是弹窗一直不关、什么都没发生。
 */
async function tapLabelBottom(label) {
  const hits = nodes()
    .filter((n) => (n.text || "").trim() === label || (n.desc || "").trim() === label)
    .sort((a, b) => a.cy - b.cy);
  const hit = hits[hits.length - 1];
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1600);
  return true;
}

async function tapContains(re) {
  const hit = nodes().find((n) => re.test((n.text || "").trim()) || re.test((n.desc || "").trim()));
  if (hit === undefined) return false;
  adb(["shell", `input tap ${hit.cx} ${hit.cy}`]);
  await sleep(1600);
  return true;
}

adb(["shell", `am force-stop ${PKG}`]);
await sleep(1000);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(4500);
adb(["shell", `am start -f 0x20 -a android.intent.action.VIEW -d "gtd://projects" ${PKG}`]);
await sleep(2500);

record("进「装修」项目", await tapLabel("装修"));
await sleep(2500);
shot("1-project");

/* ---------- 1. 新建分区 ---------- */
record("找到「新建分区」入口", await tapContains(/New section|新建分区/i));
await sleep(1500);
shot("2-section-prompt");

const promptTexts = texts();
record("弹出分区命名框", promptTexts.some((t) => /New section|Section name|分区/i.test(t)), promptTexts.slice(0, 10).join(" | "));

adb(["shell", `input text "${SECTION}"`]);
await sleep(1200);
// 注意：命名弹窗里不要按 ESC（会被当成取消）；确认要点最下面那个同名按钮
const savedPrompt = (await tapLabelBottom("New section")) || (await tapLabel("Save")) || (await tapLabel("保存"));
record("保存分区", savedPrompt, texts().slice(0, 12).join(" | "));
await sleep(2500);
shot("3-section-created");

const afterCreate = texts();
// SectionHeader 会把标题渲染成大写（SHOP），所以比较要不区分大小写
record("项目详情出现分区标题（空分区也显示）", afterCreate.some((t) => t.toUpperCase() === SECTION.toUpperCase()), afterCreate.slice(0, 14).join(" | "));

/* ---------- 2. 把任务指派到分区 ---------- */
const taskRow = nodes().find((n) => /量书房尺寸/.test(n.text || ""));
record("找到项目里的任务", taskRow !== undefined);
if (taskRow !== undefined) {
  adb(["shell", `input tap 800 ${taskRow.cy}`]);
  await sleep(2800);
}
shot("4-task-detail");

// 分区选择区在详情页顶部（hero 之后）
const detailTexts = texts();
record("任务详情出现「分区」选择区", detailTexts.some((t) => /^(Section|分区)$/i.test(t)), detailTexts.slice(0, 12).join(" | "));
record("分区 chip 可点", await tapLabel(SECTION), "");
await sleep(2000);
shot("5-section-assigned");

/* ---------- 3. 回项目页看归组 ---------- */
await back();
await sleep(2500);
shot("6-project-grouped");
const grouped = texts();
console.log("  项目页:", grouped.join(" | ").slice(0, 300));

// 分区标题应在任务之前出现（说明任务归到了该分区下）；同样不区分大小写
const idxSection = grouped.findIndex((t) => t.toUpperCase() === SECTION.toUpperCase());
const idxTask = grouped.findIndex((t) => /量书房尺寸/.test(t));
record(
  "任务归到分区下（分区标题在任务之前）",
  idxSection >= 0 && idxTask > idxSection,
  `分区位置=${idxSection} 任务位置=${idxTask}`,
);

console.log(`\n截图目录: ${shotDir}`);
summary();

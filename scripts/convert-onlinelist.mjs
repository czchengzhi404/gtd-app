/**
 * onlinelistmaker 导出 → GTD List 可导入的备份信封。
 *
 * 源格式：
 *   { list_name, list_id, share_url, items: [{ id: number, text, completed }] }
 *
 * 目标格式（与 App 自己导出的 gtd-*.json 完全一致，可被「从 JSON 导入（合并）」直接读取）：
 *   { app: "gtd", version: 1, exportedAt, records: [{ type, record }] }
 *
 * 用法：
 *   node scripts/convert-onlinelist.mjs <输入.json> <输出.json> [选项]
 *     --status next|someday|inbox   未完成项落到哪个状态（默认 next）
 *     --project <名称>              项目名（默认取 list_name）
 *     --no-project                  不建项目，任务留在收件箱
 *     --tag <标签>                  额外打一个标签（可重复）
 *
 * 幂等：记录 id 用 `ol-<源 id>`，重复导入不会产生副本
 * （同 id 同 revision，合并规则会保留已有记录）。
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);
const tags = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--tag" && args[i + 1] !== undefined) tags.push(args[i + 1]);
}

const [inputPath, outputPath] = positional;
if (!inputPath || !outputPath) {
  console.error("usage: node scripts/convert-onlinelist.mjs <in.json> <out.json> [--status next] [--project 名称] [--no-project] [--tag x]");
  process.exit(1);
}

const status = flag("--status", "next");
const validStatuses = ["inbox", "next", "waiting", "someday"];
if (!validStatuses.includes(status)) {
  console.error(`--status 只接受 ${validStatuses.join(" / ")}（done 由 completed 字段决定）`);
  process.exit(1);
}

const src = JSON.parse(fs.readFileSync(inputPath, "utf8"));

/**
 * 同一站点不同导出路径的字段名不一样，这里统一：
 *   - 完成标记：`completed`（share 导出） / `checked`（站点 init 载荷）
 *   - 清单名：`list_name` / `name`
 * 两种都吃，省得为了导一份清单先手工改字段名。
 */
const rawItems = Array.isArray(src.items) ? src.items : [];
const items = rawItems.map((item) => ({
  id: item.id,
  text: item.text,
  completed: item.completed === true || item.checked === true,
}));
if (items.length === 0) {
  console.error("源文件里没有 items");
  process.exit(1);
}

const now = Date.now();
const projectName = flag("--project", src.list_name ?? src.name ?? "导入清单");
const withProject = !hasFlag("--no-project");
const projectId = `ol-proj-${src.list_id ?? "import"}`;

/** 零填充，保持原清单顺序（orderKey 是字典序比较） */
const orderKey = (i) => String(i + 1).padStart(10, "0");

const records = [];

if (withProject) {
  records.push({
    type: "project",
    record: {
      id: projectId,
      name: projectName,
      description: src.share_url ? `来源：${src.share_url}` : "",
      kind: "parallel",
      status: "active",
      color: null,
      areaId: null,
      reviewIntervalDays: 7,
      lastReviewedAt: null,
      orderKey: orderKey(0),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: null,
    },
  });
}

items.forEach((item, index) => {
  const done = item.completed === true;
  records.push({
    type: "task",
    record: {
      id: `ol-${item.id}`,
      title: String(item.text ?? "").trim().slice(0, 2000),
      notes: "",
      status: done ? "done" : status,
      priority: 0,
      deferUntil: null,
      dueAt: null,
      completedAt: done ? now : null,
      lastCompletedAt: done ? now : null,
      projectId: withProject ? projectId : null,
      sectionId: null,
      contextIds: [],
      tags: [...tags],
      waitingFor: null,
      starred: false,
      recurrence: null,
      checklist: [],
      orderKey: orderKey(index),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: null,
    },
  });
});

const payload = { app: "gtd", version: 1, exportedAt: now, records };
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

const doneCount = items.filter((i) => i.completed === true).length;
console.log(`写入 ${outputPath}`);
console.log(`  ${items.length} 条任务（${items.length - doneCount} 未完成 / ${doneCount} 已完成）`);
console.log(`  未完成项状态：${status}`);
console.log(withProject ? `  项目：${projectName}（${projectId}）` : "  不建项目");
console.log(`  记录总数：${records.length}`);

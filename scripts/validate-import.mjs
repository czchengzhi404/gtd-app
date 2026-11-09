/**
 * 校验一份待导入的 JSON 是否能被 App 接受。
 *
 * 走的是和「从 JSON 导入（合并）」完全相同的两道关：
 *   1. recordsApplyPayloadSchema —— 结构校验
 *   2. coerceTaggedRecords      —— 逐条安全转换（非法项被丢弃）
 * 任何一条被丢弃都说明这份文件有问题，这里会明确报出来。
 *
 * 用法：bun run scripts/validate-import.mjs <文件.json>
 */
import fs from "node:fs";

import { coerceTaggedRecords, recordsApplyPayloadSchema } from "@gtd/core";

const path = process.argv[2];
if (!path) {
  console.error("usage: bun run scripts/validate-import.mjs <file.json>");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path, "utf8"));
console.log("信封:", { app: raw.app, version: raw.version, records: raw.records?.length });

const parsed = recordsApplyPayloadSchema.safeParse({ records: raw.records });
if (!parsed.success) {
  console.error("结构校验失败:", parsed.error.issues.slice(0, 5));
  process.exit(1);
}
console.log("结构校验通过");

const coerced = coerceTaggedRecords(raw.records);
console.log(`转换后记录: ${coerced.length} / ${raw.records.length}`);
if (coerced.length !== raw.records.length) {
  console.error("有记录被丢弃！");
  const keptIds = new Set(coerced.map((r) => r.record.id));
  for (const r of raw.records) {
    if (!keptIds.has(r.record.id)) console.error("  被丢弃:", r.type, r.record.id);
  }
  process.exit(1);
}

const byType = {};
for (const r of coerced) byType[r.type] = (byType[r.type] ?? 0) + 1;
console.log("按类型:", byType);

const tasks = coerced.filter((r) => r.type === "task").map((r) => r.record);
const byStatus = {};
for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
console.log("任务状态分布:", byStatus);

const emptyTitles = tasks.filter((t) => t.title.trim().length === 0);
console.log("空标题任务:", emptyTitles.length);

const projects = coerced.filter((r) => r.type === "project").map((r) => r.record);
for (const p of projects) console.log("项目:", p.name, p.id);
const projectIds = new Set(projects.map((p) => p.id));
const orphans = tasks.filter((t) => t.projectId !== null && !projectIds.has(t.projectId));
console.log("指向不存在项目的任务:", orphans.length);

console.log("\n前 3 条:");
for (const t of tasks.slice(0, 3)) {
  console.log(`  [${t.status}] ${t.orderKey} ${t.title.slice(0, 40)}`);
}
console.log("\n校验通过 ✅");

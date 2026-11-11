/**
 * 首次运行种子数据（kv 标记幂等），同时充当命令链路的启动自检。
 *
 * 返回值很重要：**true 表示这次真的种了数据**（= 真·首次安装）。
 * 首启引导靠它判断要不要出现——不能用「有没有任务」来判断，
 * 因为种子数据本身就会写 4 条任务，那样判断永远成立，引导页等于死代码。
 */
import { getSqliteExecutor, getKvValue, runCommand } from "@gtd/core";

export async function seedIfNeeded(): Promise<boolean> {
  const seeded = await getKvValue(getSqliteExecutor(), "seeded");
  if (seeded !== null) return false;
  await runCommand("context.upsert", { name: "电脑" });
  await runCommand("context.upsert", { name: "电话" });
  await runCommand("context.upsert", { name: "外出" });
  const project = await runCommand("project.upsert", { name: "装修", kind: "sequential" });
  const record = project.records[0]?.record;
  const projectId = record !== undefined && "kind" in record ? record.id : undefined;
  await runCommand("task.create", { title: "整理桌面" });
  await runCommand("task.create", { title: "回复客户邮件" });
  const todayEnd = new Date();
  todayEnd.setHours(18, 0, 0, 0);
  await runCommand("task.create", { title: "预约体检", dueAt: todayEnd.getTime() });
  if (projectId !== undefined) {
    await runCommand("task.create", { title: "量书房尺寸", projectId });
  }
  await runCommand("settings.set", { key: "seeded", value: 1 });
  return true;
}

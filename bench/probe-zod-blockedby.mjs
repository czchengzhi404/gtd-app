/** 直接用 zod 验证 task.update 的 patch.blockedBy 是否被保留。 */
import { taskUpdatePayloadSchema } from "../packages/core/src/models/commands.ts";

const payload = {
  id: "task-1",
  patch: { blockedBy: ["prereq-1"] },
};
const parsed = taskUpdatePayloadSchema.parse(payload);
console.log("parsed:", JSON.stringify(parsed));
console.log("blockedBy 保留:", JSON.stringify(parsed.patch.blockedBy));

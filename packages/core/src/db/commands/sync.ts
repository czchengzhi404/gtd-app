import type { Handler } from "./shared";
import { applyRemoteRecords } from "./shared";

/**
 * 同步 / 导入共用一条合并路径（墓碑安全）：整条 LWW 之外，任务额外走
 * 字段级 3-way 合并（见 shared.applyRemoteRecords 与 sync/fieldmerge.ts）。
 * 返回值除 write-back 记录外携带字段级合并汇总（mergeSummary）。
 */
const applyRemote: Handler<"sync.applyRemote"> = async (tx, payload, ctx) => {
  const outcome = await applyRemoteRecords(tx, payload, ctx);
  return { records: outcome.applied, mergeSummary: outcome.mergeSummary };
};

const mergeImport: Handler<"import.merge"> = async (tx, payload, ctx) => {
  const outcome = await applyRemoteRecords(tx, payload, ctx);
  return { records: outcome.applied, mergeSummary: outcome.mergeSummary };
};

export const syncCommands = {
  "sync.applyRemote": applyRemote,
  "import.merge": mergeImport,
} satisfies { [K in "sync.applyRemote" | "import.merge"]: Handler<K> };

/** 核对源码树与远端仓库的关键文件是否一致，找出漏推的 blockedBy 改动。 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const REPO = "czchengzhi404/gtd-app";
const FILES = [
  "packages/core/src/models/commands.ts",
  "packages/core/src/models/task.ts",
  "packages/core/src/db/migrations.ts",
  "packages/core/src/db/coerce.ts",
  "packages/core/src/db/mappers.ts",
  "packages/core/src/db/commands/task.ts",
  "packages/core/src/db/commands/shared.ts",
  "packages/core/src/db/commands/templates.ts",
  "packages/core/src/features/exporters.ts",
  "packages/core/src/store/app-store.ts",
  "packages/core/src/sync/fieldmerge.ts",
  "packages/core/src/index.ts",
  "packages/core/src/features/dependencies.ts",
  "packages/core/src/features/next-action.ts",
];

function remoteText(path) {
  const b64 = execFileSync("gh", ["api", `repos/${REPO}/contents/${path}`, "--jq", ".content"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).replace(/\s/g, "");
  return Buffer.from(b64, "base64").toString("utf8");
}

for (const file of FILES) {
  let remote;
  try {
    remote = remoteText(file);
  } catch (e) {
    console.log(`MISSING  ${file}`);
    continue;
  }
  const local = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const localHas = local.includes("blockedBy") || local.includes("blocked_by");
  const remoteHas = remote.includes("blockedBy") || remote.includes("blocked_by");
  const same = local === remote;
  const flag = same ? "SAME    " : localHas && !remoteHas ? "❌ LOST " : localHas && remoteHas ? "HAS-BOTH" : "DIFF    ";
  console.log(`${flag} ${file}  local=${local.length} remote=${remote.length} blockedBy(local=${localHas},remote=${remoteHas})`);
}

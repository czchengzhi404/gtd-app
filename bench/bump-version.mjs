import fs from "node:fs";
import path from "node:path";

/**
 * 批量改版本号（3 处：expo config 的 version / android.versionCode、两个工作区 package.json）。
 *
 * 用法：node bench/bump-version.mjs <repoRoot> <version> <versionCode>
 * 例：  node bench/bump-version.mjs . 2.5.1 23
 */
const root = process.argv[2];
const VERSION = process.argv[3];
const VERSION_CODE = Number(process.argv[4]);

if (!root || !VERSION || !Number.isFinite(VERSION_CODE)) {
  console.error("usage: node bump-version.mjs <repoRoot> <version> <versionCode>");
  process.exit(1);
}

const appJsonPath = path.join(root, "apps/mobile/app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
appJson.expo.version = VERSION;
appJson.expo.android.versionCode = VERSION_CODE;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n", "utf8");

for (const rel of ["apps/mobile/package.json", "apps/desktop/package.json"]) {
  const p = path.join(root, rel);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  json.version = VERSION;
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
}

// 旧调试产物
for (const junk of ["remote-commit.json", "remote-main.json", "remote-tree-rec.json"]) {
  const p = path.join(root, junk);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

console.log(`bumped to ${VERSION} (versionCode ${VERSION_CODE})`);

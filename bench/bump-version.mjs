import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node bump-version.mjs <repoRoot>");
  process.exit(1);
}

const VERSION = "2.5.0";
const VERSION_CODE = 22;

// 1) Expo 配置：version + android.versionCode
const appJsonPath = path.join(root, "apps/mobile/app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
appJson.expo.version = VERSION;
appJson.expo.android.versionCode = VERSION_CODE;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n", "utf8");

// 2) 两个工作区包版本
for (const rel of ["apps/mobile/package.json", "apps/desktop/package.json"]) {
  const p = path.join(root, rel);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  json.version = VERSION;
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
}

// 3) 删掉旧调试产物
for (const junk of ["remote-commit.json", "remote-main.json", "remote-tree-rec.json"]) {
  const p = path.join(root, junk);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

console.log(`bumped to ${VERSION} (versionCode ${VERSION_CODE})`);

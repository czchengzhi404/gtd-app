import { execFileSync } from "node:child_process";

/**
 * 查看某个 tag 的 release 状态和产物清单（含 GitHub 给的 sha256 digest）。
 * 用法：node bench/inspect-release.mjs [tag]
 *
 * 存在的理由：`gh release view --jq` 在 PowerShell 里会因为引号被剥掉而报
 * "accepts at most 1 arg(s)"，所有 jq 表达式都写不进去。这里用 execFileSync
 * 传数组参数，不经过 shell，一劳永逸。
 */
const tag = process.argv[2] ?? "v2.7.4";
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

const json = gh([
  "api",
  "repos/czchengzhi404/gtd-app/releases",
  "--jq",
  `.[] | select(.tag_name=="${tag}") | {tag: .tag_name, draft: .draft, id: .id, assets: [.assets[] | {name, size, digest}]}`,
]);

const release = JSON.parse(json);
if (release.tag === undefined) {
  console.error(`找不到 tag ${tag} 的 release`);
  process.exit(1);
}
console.log(`tag ${release.tag}  draft=${release.draft}  id=${release.id}`);
for (const a of release.assets) {
  const mb = (a.size / 1048576).toFixed(1).padStart(6);
  console.log(`  ${mb}MB  ${a.name}  ${a.digest ?? ""}`);
}

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * 通过 GitHub Git Data API 推送当前 commit 的全部变更。
 *
 * 为什么不用 git push：本机到 github.com:443 直连被重置，而 ~/.gitconfig 里配的
 * 代理只在特定网络下可用；`gh` 走的是另一条可用通道。
 *
 * 注意：blob 内容必须走 stdin（`--input -`）。用 `-f content=...` 会超过
 * Windows 命令行 32KB 上限（bun.lock 这类文件 base64 后几百 KB）。
 *
 * 用法：node bench/push-commit-via-api.mjs <repoRoot> <owner/repo> <branch> <message> [文件列表]
 *
 * 文件列表：可选的逗号分隔路径。给了就只推这些文件，忽略 git diff。
 * 为什么需要它：本机的 origin/main 跟踪引用常年停在上古版本（网络不通没法 fetch），
 * `git diff origin/main HEAD` 会把整个仓库都算成改动，每次发布都重传几十个文件。
 * 显式列表让一次发布的成本等于它真实的改动量。
 */
const [root, repo, branch, message, fileListRaw] = process.argv.slice(2);
if (!root || !repo || !branch || !message) {
  console.error("usage: node push-commit-via-api.mjs <root> <owner/repo> <branch> <message> [file1,file2]");
  process.exit(1);
}

function gh(args, input) {
  return execFileSync("gh", ["api", ...args], {
    encoding: "utf8",
    input,
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
}

const headSha = gh([`repos/${repo}/git/ref/heads/${branch}`, "--jq", ".object.sha"]);
const headCommit = JSON.parse(gh([`repos/${repo}/git/commits/${headSha}`]));
const baseTree = headCommit.tree.sha;
console.log("remote head:", headSha.slice(0, 8));

const diff =
  fileListRaw === undefined
    ? execFileSync("git", ["diff", "--name-status", "origin/main", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      })
    : fileListRaw
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .map((f) => `M\t${f}`)
        .join("\n");
const changes = diff
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => {
    const [status, file] = line.split(/\s+/);
    return { status, file };
  });

console.log(`changes: ${changes.length}`);

const entries = [];
for (const { status, file } of changes) {
  if (status === "D") {
    entries.push({ path: file, mode: "100644", type: "blob", sha: null });
    console.log("  delete", file);
    continue;
  }
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) {
    // 显式列表里点名了但文件不在磁盘上 —— 当成删除，而不是默默跳过。
    entries.push({ path: file, mode: "100644", type: "blob", sha: null });
    console.log("  delete", file);
    continue;
  }
  const content = fs.readFileSync(abs).toString("base64");
  const blobSha = gh(
    ["-X", "POST", `repos/${repo}/git/blobs`, "--input", "-", "--jq", ".sha"],
    JSON.stringify({ content, encoding: "base64" }),
  );
  entries.push({ path: file, mode: "100644", type: "blob", sha: blobSha });
  console.log("  put   ", file, `${Math.round(content.length / 1024)}KB`);
}

const treeSha = gh(
  ["-X", "POST", `repos/${repo}/git/trees`, "--input", "-", "--jq", ".sha"],
  JSON.stringify({ base_tree: baseTree, tree: entries }),
);
const commitSha = gh(
  ["-X", "POST", `repos/${repo}/git/commits`, "--input", "-", "--jq", ".sha"],
  JSON.stringify({ message, tree: treeSha, parents: [headSha] }),
);
gh(["-X", "PATCH", `repos/${repo}/git/refs/heads/${branch}`, "-f", `sha=${commitSha}`, "-F", "force=false"]);

console.log("pushed:", commitSha.slice(0, 8));

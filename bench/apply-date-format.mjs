/**
 * 一次性迁移：把 `toLocale*` 的日期时间调用换成 @gtd/ui 的确定性格式化。
 *
 * 原因：toLocaleString() 跟随设备区域，中文界面上出现「11/23/2026, 2:55:28 PM」；
 * 部分 Hermes 构建还会忽略传入的 locale 参数。
 *
 * 幂等：已替换过的文件里找不到旧串，只会打印 MISS 而不会重复改。
 */
import fs from "node:fs";

const edits = [
  [
    "packages/ui/src/components/TaskDetailContent.tsx",
    [["new Date(task.deferUntil).toLocaleDateString()", "formatDate(task.deferUntil)"]],
  ],
  [
    "packages/ui/src/components/UndoBar.tsx",
    [["new Date(item.createdAt).toLocaleTimeString()", "formatTime(item.createdAt)"]],
  ],
  [
    "apps/mobile/src/app/(tabs)/more.tsx",
    [
      ['new Date(Number(kv["sync.last"])).toLocaleString()', 'formatDateTime(Number(kv["sync.last"]))'],
      ["new Date(lastReviewAt).toLocaleDateString()", "formatDate(lastReviewAt)"],
    ],
  ],
  [
    "apps/mobile/src/app/(tabs)/today.tsx",
    [["new Date(now).toLocaleDateString()", "formatDate(now)"]],
  ],
  [
    "apps/mobile/src/app/history.tsx",
    [["new Date(version.createdAt).toLocaleString()", "formatDateTime(version.createdAt)"]],
  ],
  [
    "apps/mobile/src/app/process.tsx",
    [["new Date(current.dueAt).toLocaleDateString()", "formatDate(current.dueAt)"]],
  ],
  [
    "apps/mobile/src/app/recent.tsx",
    [["new Date(entry.createdAt).toLocaleTimeString()", "formatTime(entry.createdAt)"]],
  ],
  [
    "apps/mobile/src/app/sync.tsx",
    [
      [
        'new Date(Number(raw)).toLocaleString()',
        "formatDateTime(Number(raw))",
      ],
      [
        "new Date(peer.lastActivityAt).toLocaleString()",
        "formatDateTime(peer.lastActivityAt)",
      ],
    ],
  ],
  [
    "apps/mobile/src/app/trash.tsx",
    [
      [
        "new Date(item.deletedAt ?? 0).toLocaleDateString()",
        "formatDate(item.deletedAt ?? 0)",
      ],
    ],
  ],
  [
    "apps/mobile/src/hooks/useListInteractions.ts",
    [["new Date(plan.deferredAt).toLocaleDateString()", "formatDate(plan.deferredAt)"]],
  ],
  [
    "apps/mobile/src/app/about.tsx",
    [
      [
        'new Date(checkedAt).toLocaleString(getLang() === "en" ? "en-US" : "zh-CN")',
        "formatDateTime(checkedAt)",
      ],
    ],
  ],
];

for (const [file, pairs] of edits) {
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (!src.includes(from)) {
      console.log(`MISS ${file}: ${from.slice(0, 60)}`);
      continue;
    }
    src = src.split(from).join(to);
  }

  // 判断需要哪些导入（排除已经出现在导入列表里的）
  const needed = ["formatDate", "formatTime", "formatDateTime"].filter((name) => {
    const used = new RegExp(`\\b${name}\\(`).test(src);
    const imported = new RegExp(`\\b${name},`).test(src) || new RegExp(`\\b${name}\\s*\\n?\\}`).test(src);
    return used && !imported;
  });

  if (needed.length > 0) {
    const m = src.match(/import \{([\s\S]*?)\} from "@gtd\/ui";/);
    if (m) {
      const body = m[1].replace(/\s+$/, "");
      const add = needed.map((n) => `  ${n},`).join("\n");
      src = src.replace(m[0], `import {${body}\n${add}\n} from "@gtd/ui";`);
    } else {
      console.log(`NO-IMPORT ${file} needs ${needed.join(",")}`);
    }
  }

  fs.writeFileSync(file, src);
  console.log(`patched ${file}${needed.length > 0 ? ` (+${needed.join(",")})` : ""}`);
}

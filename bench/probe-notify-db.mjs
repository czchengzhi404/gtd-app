/** 查设备上 tasks 的 dueAt 与 kv 里的 notified.* 键，定位通知为何没发。 */
import { adb, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";

// expo-sqlite 的库文件在 files/SQLite/ 下，需 root 或 run-as（debug 包才能 run-as）
const paths = adb(["shell", `run-as ${PKG} ls -R /data/data/${PKG}/files 2>/dev/null`], {
  encoding: "utf8",
}).trim();
console.log("files 树:");
console.log(paths.slice(0, 1200));

const dbCandidates = paths
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => /\.db$|\.sqlite$/.test(s));
console.log("\n候选库文件:", dbCandidates);

// 逐个试
for (const f of dbCandidates) {
  const full = f.startsWith("/") ? f : `/data/data/${PKG}/files/${f}`;
  for (const q of [
    "select id,title,due_at,status from tasks order by created_at desc limit 5;",
    "select key from kv where key like 'notified.%';",
  ]) {
    try {
      const out = adb(["shell", `run-as ${PKG} sqlite3 '${full}' "${q}" 2>&1`], { encoding: "utf8" });
      console.log(`\n[${full}] ${q}\n${out.slice(0, 800)}`);
    } catch (e) {
      console.log(`\n[${full}] ${q}\n失败: ${((e.stdout ?? "") + (e.stderr ?? "")).toString().slice(0, 200)}`);
    }
  }
}
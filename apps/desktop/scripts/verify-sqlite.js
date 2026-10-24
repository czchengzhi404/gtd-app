/**
 * 硬验收③：在 apps/desktop 的真实 workspace 上下文中验证
 * better-sqlite3 ≥13.0.3 的 N-API 预编译开箱可用（无需 @electron/rebuild）。
 * 全流程：resolve 路径检查 → create → migrate → write(immediate 事务) → read → close。
 * 运行：electron scripts/verify-sqlite.js（由 Electron 的 Node runtime 加载）。
 * SQL 纪律：exec 仅接受单一静态字符串字面量；其余语句参数绑定，无任何拼接。
 */
const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const SQL_INSERT_TASK =
  "INSERT INTO tasks (id, title, revision, deleted_at) VALUES (?, ?, ?, NULL)";
const SQL_SELECT_TASK = "SELECT title, revision FROM tasks WHERE id = ?";
const SQL_TOMBSTONE = "UPDATE tasks SET deleted_at = ? WHERE id = ?";
const SQL_COUNT_ALIVE = "SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL";
const SQL_SQLITE_VERSION = "SELECT sqlite_version() AS v";

void app.whenReady().then(() => {
  let dbPath = null;
  try {
    // 1) 解析位置：必须落在 monorepo 根的 hoisted node_modules 下
    const resolved = require.resolve("better-sqlite3");
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const hoistedRoot = path.join(repoRoot, "node_modules");
    console.log("[verify-sqlite] require.resolve =>", resolved);
    if (!resolved.startsWith(hoistedRoot)) {
      throw new Error(
        "better-sqlite3 未解析到 hoisted 根目录：" + resolved + "，期望前缀：" + hoistedRoot,
      );
    }

    // 2) 加载 N-API 预编译（若 ABI 不匹配会在这里抛错）
    const Database = require("better-sqlite3");
    const pkg = require("better-sqlite3/package.json");
    console.log("[verify-sqlite] better-sqlite3 版本:", pkg.version);
    const parts = pkg.version.split(".").map(Number);
    const major = parts[0] ?? 0;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;
    if (major < 13 || (major === 13 && (minor < 1 && patch < 3))) {
      throw new Error("better-sqlite3 版本需 ≥13.0.3，实际 " + pkg.version);
    }

    // 临时库文件：固定文件名，先清后建，避免动态路径插值
    dbPath = path.join(os.tmpdir(), "gtd-verify.sqlite3");
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + "-wal", { force: true });
    fs.rmSync(dbPath + "-shm", { force: true });
    const db = new Database(dbPath);

    // 3) 打开即设 WAL + busy_timeout（端口契约）
    console.log("[verify-sqlite] journal_mode =", db.pragma("journal_mode = WAL"));
    db.pragma("busy_timeout = 5000");

    // 4) migrate（单一静态字符串字面量 DDL）
    db.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER)");

    // 5) write：immediate 事务批量插入（参数绑定）
    const insert = db.prepare(SQL_INSERT_TASK);
    const insertAll = db.transaction(function (rows) {
      for (const r of rows) insert.run(r.id, r.title, r.revision);
    });
    insertAll.immediate([
      { id: "t1", title: "硬验收③ 写入", revision: 1 },
      { id: "t2", title: "第二条", revision: 1 },
    ]);

    // 6) read 校验 + tombstone 更新
    const row = db.prepare(SQL_SELECT_TASK).get("t1");
    if (!row || row.title !== "硬验收③ 写入" || row.revision !== 1) {
      throw new Error("读回数据不匹配: " + JSON.stringify(row));
    }
    db.prepare(SQL_TOMBSTONE).run(Date.now(), "t2");
    const alive = db.prepare(SQL_COUNT_ALIVE).get();
    if (alive.n !== 1) throw new Error("软删除后剩余行数不为 1");

    console.log("[verify-sqlite] sqlite 版本:", db.prepare(SQL_SQLITE_VERSION).get().v);
    db.close();

    console.log(
      "VERIFY-SQLITE PASS: resolve(hoisted) ✓ N-API 加载 ✓ migrate ✓ immediate 写 ✓ 读 ✓ close ✓",
    );
    app.exit(0);
  } catch (err) {
    console.error("VERIFY-SQLITE FAIL:", err && err.stack ? err.stack : err);
    if (dbPath) {
      fs.rmSync(dbPath, { force: true });
    }
    app.exit(1);
  }
});

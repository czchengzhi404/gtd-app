import { app, globalShortcut, protocol } from "electron";
import path from "node:path";
import { migrate } from "@gtd/core";
import { openSqlite } from "./db";
import { startAutoBackup } from "./backup";
import { registerIpc, setMenuLanguageHandler } from "./ipc";
import { applyMenuLanguage, buildAppMenu, createTray, getMenuLang, setMenuLang } from "./menu";
import { APP_SCHEME, getSqlite, isSmoke, setMainWindow, setSqlite, setIsQuitting, shotCfg } from "./state";
import { setupAutoUpdater } from "./updater";
import { runShot, runSmoke } from "./smoke";
import { createWindow, handleAppProtocol, registerDefaultShortcut } from "./window";

/**
 * Electron 壳（阶段三）：窗口 + app:// 静态产物 + SPA fallback + 数据 IPC +
 * 原生能力（托盘/全局快捷键/通知/菜单/dialog+fs）。GTD 决策逻辑在 @gtd/core。
 * 本文件只做入口编排：migrate → 协议 → IPC → 窗口/托盘/菜单/快捷键/备份/自动更新 → 生命周期。
 */

// 必须在 app ready 之前注册：模块顶层执行，import 即生效
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

/* ---------------- 生命周期 ---------------- */

void app.whenReady().then(async () => {
  try {
    setSqlite(openSqlite(path.join(app.getPath("userData"), "gtd.db")));
    await migrate(getSqlite()!.executor);
    // 启动语言：读 kv.lang（无设置默认中文）
    const rows = await getSqlite()!.executor.query<Record<string, unknown>>(
      "SELECT value FROM kv WHERE key = ?",
      ["lang"],
    );
    const saved = rows[0]?.value;
    if (saved === "en" || saved === "zh") setMenuLang(saved);
  } catch (err) {
    console.error("数据库初始化失败:", err);
    app.exit(1);
    return;
  }
  setMenuLanguageHandler(applyMenuLanguage);
  handleAppProtocol();
  registerIpc();
  const win = createWindow();
  setMainWindow(win);
  createTray(getMenuLang());
  buildAppMenu(getMenuLang());
  registerDefaultShortcut();
  startAutoBackup();
  void setupAutoUpdater();
  if (shotCfg !== null) {
    void runShot(win);
  } else if (isSmoke) {
    void runSmoke(win);
  }
});

app.on("before-quit", () => {
  setIsQuitting(true);
});

app.on("will-quit", () => {
  // 全局快捷键随退出注销，避免占用系统资源
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  getSqlite()?.close();
  app.quit();
});

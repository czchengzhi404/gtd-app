import type { BrowserWindow, Tray } from "electron";
import path from "node:path";
import type { SqliteHandle } from "./db";

/**
 * 主进程共享运行时状态：窗口 / 数据库 / 托盘 / 退出标志 / 路径白名单，
 * 以及启动参数与路径常量。其他模块一律通过这里的 getter/setter 读写，
 * 不导出裸 let 供别处赋值；各模块只依赖本文件，不互相依赖，避免循环引用。
 */

export const APP_SCHEME = "app";
export const APP_HOST = "gtd";
export const isDev = process.argv.includes("--dev");
export const isSmoke = process.argv.includes("--smoke");
/** 截图模式：--shot=<宽>x<高>,<输出路径>,<路由>  例：--shot=390x844,out.png,today */
const shotArg = process.argv.find((a) => a.startsWith("--shot="));
export const shotCfg = (() => {
  if (shotArg === undefined) return null;
  const [size, out, route] = shotArg.slice("--shot=".length).split(",");
  const [w, h] = (size ?? "").split("x").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || out === undefined) return null;
  return { width: w, height: h, out, route: route ?? "" };
})();
export const DEV_URL = process.env.GTD_DEV_URL ?? "http://localhost:8081";
/** 渲染产物根目录：dist-electron/../renderer（与打包目录布局一致） */
export const rendererRoot = path.resolve(__dirname, "..", "renderer");

let mainWindow: BrowserWindow | null = null;
let sqlite: SqliteHandle | null = null;
let tray: Tray | null = null;
/** 用户主动退出（区别于点关闭键最小化到托盘） */
let isQuitting = false;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getSqlite(): SqliteHandle | null {
  return sqlite;
}

export function setSqlite(handle: SqliteHandle | null): void {
  sqlite = handle;
}

export function getTray(): Tray | null {
  return tray;
}

export function setTray(value: Tray | null): void {
  tray = value;
}

export function getIsQuitting(): boolean {
  return isQuitting;
}

export function setIsQuitting(value: boolean): void {
  isQuitting = value;
}

/** fs 通道路径白名单：仅允许已注册根（同步根 / 用户经 dialog 选定的文件） */
export const allowedRoots = new Set<string>();

import { BrowserWindow, globalShortcut, net, protocol } from "electron";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import {
  APP_HOST,
  APP_SCHEME,
  DEV_URL,
  getIsQuitting,
  getMainWindow,
  isDev,
  isSmoke,
  rendererRoot,
  shotCfg,
} from "./state";

/**
 * 窗口与协议：创建主窗口（关闭键 = 最小化到托盘）、显示/隐藏切换、向渲染端发消息、
 * app:// 静态产物解析（含 SPA fallback 与目录穿越防护），以及系统级快速收集快捷键。
 * 只经 state.ts 读写窗口单例，不与其他壳模块互相 import。
 */

export function sendToRenderer(channel: string, payload?: unknown): void {
  getMainWindow()?.webContents.send(channel, payload);
}

export function toggleMainWindow(): void {
  const win = getMainWindow();
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: shotCfg?.width ?? 1280,
    height: shotCfg?.height ?? 800,
    minWidth: shotCfg !== null ? undefined : 375,
    minHeight: shotCfg !== null ? undefined : 500,
    title: "GTD 清单",
    // 冒烟/诊断在后台跑：不显示、不抢焦点（executeJavaScript 不依赖前台）
    // 截图模式：窗口移到屏幕外并禁止聚焦，capturePage 仍可用
    show: shotCfg !== null ? false : !isSmoke && !process.argv.includes("--diag"),
    focusable: shotCfg !== null ? false : !isSmoke,
    skipTaskbar: shotCfg !== null,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 截图模式用离屏渲染：窗口不可见也能抓帧，且绝不会出现在前台
      ...(shotCfg !== null ? { offscreen: true } : {}),
    },
  });
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[renderer] gone: ${details.reason}`);
  });
  // 关闭键 = 最小化到托盘；真正退出经托盘菜单/app:quit（isQuitting）
  win.on("close", (event) => {
    if (!getIsQuitting()) {
      event.preventDefault();
      win.hide();
    }
  });
  if (isDev) {
    void win.loadURL(DEV_URL);
  } else {
    // 根路径交给 SPA fallback 返回 index.html；路由由 Expo Router 读 pathname 解析。
    void win.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
  }
  return win;
}

/** 解析 app:// pathname 到 renderer 内真实文件；越界（目录穿越）返回 null */
export function resolveRendererFile(pathname: string): string | null {
  const clean = pathname.split("?")[0] ?? pathname;
  const rel = decodeURIComponent(clean).replace(/^\/+/, "");
  if (!rel) return null;
  const candidate = path.resolve(rendererRoot, rel);
  if (candidate !== rendererRoot && !candidate.startsWith(rendererRoot + path.sep)) return null;
  try {
    if (fs.statSync(candidate).isFile()) return candidate;
  } catch {
    /* not found */
  }
  return null;
}

export function handleAppProtocol(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const pathname = new URL(request.url).pathname;
    const file = resolveRendererFile(pathname);
    // SPA fallback：未命中的路径返回 index.html，由 Expo Router 客户端接管
    const target = file ?? path.join(rendererRoot, "index.html");
    if (!fs.existsSync(target)) {
      return new Response("renderer not built: run expo export --platform web", { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

export function registerDefaultShortcut(): void {
  // 系统级快速收集；应用退出时 will-quit 统一 unregisterAll
  const ok = globalShortcut.register("CmdOrCtrl+Shift+Space", () => {
    toggleMainWindow();
    sendToRenderer("tray:quick-add");
  });
  if (!ok) console.warn("[shortcuts] CmdOrCtrl+Shift+Space 注册失败（可能被占用）");
}

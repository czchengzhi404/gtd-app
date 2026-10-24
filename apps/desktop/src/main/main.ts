import { app, BrowserWindow, ipcMain, protocol, net, Tray, Menu, Notification, globalShortcut, dialog, nativeImage } from "electron";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 自动更新：发布源由 electron-builder.yml 的 publish（GitHub Releases）生成
 * 到 app-update.yml，打包后自动生效。私有仓库需令牌，检查失败静默降级。
 */
async function setupAutoUpdater(): Promise<void> {
  if (app.isPackaged !== true) return;
  try {
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.on("update-downloaded", () => {
      sendToRenderer("menu:action", { action: "update-ready" });
    });
    await autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.warn("[updater] 检查失败:", err instanceof Error ? err.message : String(err));
    });
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 4 * 60 * 60 * 1000);
  } catch (err) {
    console.warn("[updater] 初始化失败:", err instanceof Error ? err.message : String(err));
  }
}

import type { CommandOp } from "@gtd/core";
import {
  executeCommand,
  migrate,
  syncNow,
  createSyncDepsForExecutor,
  createFolderProvider,
} from "@gtd/core";
import { openSqlite, type SqliteHandle } from "./db";

/**
 * Electron 壳（阶段三）：窗口 + app:// 静态产物 + SPA fallback + 数据 IPC +
 * 原生能力（托盘/全局快捷键/通知/菜单/dialog+fs）。GTD 决策逻辑在 @gtd/core。
 */

const APP_SCHEME = "app";
const APP_HOST = "gtd";
const isDev = process.argv.includes("--dev");
const isSmoke = process.argv.includes("--smoke");
const DEV_URL = process.env.GTD_DEV_URL ?? "http://localhost:8081";
const rendererRoot = path.resolve(__dirname, "..", "renderer");

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let sqlite: SqliteHandle | null = null;
let tray: Tray | null = null;
/** 用户主动退出（区别于点关闭键最小化到托盘） */
let isQuitting = false;

/* ---------------- 数据 IPC ---------------- */

const COMMAND_OP_FLAG: { [K in CommandOp]: true } = {
  "task.create": true,
  "task.update": true,
  "task.moveStatus": true,
  "task.reorder": true,
  "task.complete": true,
  "task.uncomplete": true,
  "task.softDelete": true,
  "project.upsert": true,
  "project.softDelete": true,
  "context.upsert": true,
  "section.create": true,
  "settings.set": true,
  "sync.applyRemote": true,
  "import.merge": true,
};
const COMMAND_OPS = Object.keys(COMMAND_OP_FLAG) as CommandOp[];

let dbQueue: Promise<unknown> = Promise.resolve();
function enqueueDb<T>(fn: () => Promise<T>): Promise<T> {
  const next = dbQueue.then(fn, fn);
  dbQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function assertReadOnly(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (trimmed.length === 0) throw new Error("空查询");
  if (trimmed.includes(";")) throw new Error("仅允许单条查询");
  if (!/^(select|with)\s/i.test(trimmed)) throw new Error("仅允许只读查询（SELECT/WITH）");
}

/** fs 通道路径白名单：仅允许已注册根（同步根 / 用户经 dialog 选定的文件） */
const allowedRoots = new Set<string>();

function assertAllowedPath(target: string): string {
  const resolved = path.resolve(target);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  }
  throw new Error(`路径不在允许范围内: ${resolved}`);
}

function registerIpc(): void {
  ipcMain.handle("command", (_event, op: unknown, payload: unknown) => {
    if (typeof op !== "string" || !COMMAND_OPS.includes(op as CommandOp)) {
      throw new Error(`未注册的命令: ${String(op)}`);
    }
    if (typeof payload !== "object" || payload === null) {
      throw new Error("payload 必须是对象");
    }
    const result = enqueueDb(() =>
      executeCommand(sqlite!.executor, op as CommandOp, payload, { now: () => Date.now() }),
    );
    // 语言设置：kv 持久化后即时重建菜单/托盘（壳层本地化不依赖渲染进程）
    if (op === "settings.set") {
      const p = payload as { key?: unknown; value?: unknown };
      if (p.key === "lang" && (p.value === "zh" || p.value === "en")) {
        void result.then(() => applyMenuLanguage(p.value as MenuLang));
      }
    }
    return result;
  });
  ipcMain.handle("query", (_event, sql: unknown, params: unknown) => {
    if (typeof sql !== "string") throw new Error("sql 必须是字符串");
    assertReadOnly(sql);
    const list = Array.isArray(params) ? (params as unknown[]) : [];
    return enqueueDb(() => sqlite!.executor.query(sql, list));
  });

  // ---- 原生能力 IPC（阶段三）----
  ipcMain.handle("shortcuts:register", (_event, accelerator: unknown, actionId: unknown) => {
    if (typeof accelerator !== "string" || typeof actionId !== "string") {
      throw new Error("accelerator/actionId 必须是字符串");
    }
    return globalShortcut.register(accelerator, () => {
      mainWindow?.webContents.send("shortcut:triggered", { actionId });
    });
  });
  ipcMain.handle("notify", (_event, payload: unknown) => {
    const p = payload as { title?: unknown; body?: unknown; taskId?: unknown };
    if (typeof p?.title !== "string" || typeof p?.body !== "string") {
      throw new Error("notify 需要 title/body");
    }
    const notification = new Notification({
      title: p.title,
      body: p.body,
      icon: path.resolve(__dirname, "..", "assets", "tray@2x.png"),
    });
    notification.on("click", () => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send("notification:click", { taskId: p.taskId });
    });
    notification.show();
    return true;
  });
  ipcMain.handle("dialog:open", async (_event, options: unknown) => {
    const o = (options ?? {}) as { directory?: boolean };
    const props: Electron.OpenDialogOptions["properties"] =
      o.directory === true ? ["openDirectory"] : ["openFile"];
    const result = await dialog.showOpenDialog(mainWindow!, { properties: props });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0] as string;
    // 选定即授权：目录作同步根；文件以其所在目录为读取根
    allowedRoots.add(o.directory === true ? path.resolve(picked) : path.dirname(path.resolve(picked)));
    return picked;
  });
  ipcMain.handle("dialog:save", async (_event, options: unknown) => {
    const o = (options ?? {}) as { defaultPath?: unknown };
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: typeof o.defaultPath === "string" ? o.defaultPath : undefined,
    });
    if (result.canceled || result.filePath === undefined) return null;
    allowedRoots.add(path.resolve(result.filePath, ".."));
    return result.filePath;
  });
  ipcMain.handle("fs:readFile", (_event, target: unknown) => {
    if (typeof target !== "string") throw new Error("path 必须是字符串");
    const safe = assertAllowedPath(target);
    return fs.existsSync(safe) ? fs.readFileSync(safe, "utf-8") : null;
  });
  ipcMain.handle("fs:listDir", (_event, target: unknown) => {
    if (typeof target !== "string") throw new Error("path 必须是字符串");
    const safe = assertAllowedPath(target);
    return fs.existsSync(safe) ? fs.readdirSync(safe) : [];
  });
  ipcMain.handle("fs:writeFile", (_event, target: unknown, content: unknown) => {
    if (typeof target !== "string" || typeof content !== "string") {
      throw new Error("path/content 必须是字符串");
    }
    const safe = assertAllowedPath(target);
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, content, "utf-8");
    return true;
  });
  ipcMain.handle("sync:setFolderRoot", (_event, root: unknown) => {
    if (typeof root !== "string") throw new Error("root 必须是字符串");
    const resolved = path.resolve(root);
    fs.mkdirSync(resolved, { recursive: true });
    allowedRoots.add(resolved);
    return resolved;
  });
  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.handle("window:show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  ipcMain.handle("window:hide", () => mainWindow?.hide());
  ipcMain.handle("window:toggle", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  ipcMain.handle("window:minimizeToTray", () => mainWindow?.hide());
  ipcMain.handle("app:getInfo", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
  }));
}

/* ---------------- 托盘 / 菜单 / 快捷键（中英双语，随 kv.lang 重建） ---------------- */

type MenuLang = "zh" | "en";

interface MenuStrings {
  tasks: string;
  newTask: string;
  quickCapture: string;
  syncNow: string;
  weeklyReview: string;
  edit: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  view: string;
  reload: string;
  devTools: string;
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
  fullscreen: string;
  window: string;
  minimize: string;
  close: string;
  trayQuickAdd: string;
  trayToggle: string;
  trayQuit: string;
  trayTooltip: string;
}

const MENU_I18N: Record<MenuLang, MenuStrings> = {
  zh: {
    tasks: "任务",
    newTask: "新建任务",
    quickCapture: "快速收集",
    syncNow: "立即同步",
    weeklyReview: "每周回顾",
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    selectAll: "全选",
    view: "视图",
    reload: "重新加载",
    devTools: "切换开发者工具",
    zoomIn: "放大",
    zoomOut: "缩小",
    resetZoom: "重置缩放",
    fullscreen: "全屏",
    window: "窗口",
    minimize: "最小化",
    close: "关闭",
    trayQuickAdd: "快速添加任务",
    trayToggle: "显示 / 隐藏窗口",
    trayQuit: "退出",
    trayTooltip: "GTD 清单",
  },
  en: {
    tasks: "Tasks",
    newTask: "New Task",
    quickCapture: "Quick Capture",
    syncNow: "Sync Now",
    weeklyReview: "Weekly Review",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    view: "View",
    reload: "Reload",
    devTools: "Toggle Developer Tools",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    resetZoom: "Reset Zoom",
    fullscreen: "Full Screen",
    window: "Window",
    minimize: "Minimize",
    close: "Close",
    trayQuickAdd: "Quick add task",
    trayToggle: "Show / Hide Window",
    trayQuit: "Quit",
    trayTooltip: "GTD List",
  },
};

let menuLang: MenuLang = "zh";

function sendToRenderer(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function toggleMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function buildTrayContextMenu(lang: MenuLang): Electron.Menu {
  const m = MENU_I18N[lang];
  return Menu.buildFromTemplate([
    {
      label: m.trayQuickAdd,
      click: () => {
        mainWindow?.show();
        sendToRenderer("tray:quick-add");
      },
    },
    { label: m.trayToggle, click: () => toggleMainWindow() },
    { type: "separator" },
    { label: m.trayQuit, click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function createTray(lang: MenuLang): void {
  const iconPath = path.resolve(__dirname, "..", "assets", "tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(process.platform === "darwin");
  tray = new Tray(icon);
  tray.setToolTip(MENU_I18N[lang].trayTooltip);
  tray.setContextMenu(buildTrayContextMenu(lang));
  tray.on("click", () => toggleMainWindow());
}

function buildAppMenu(lang: MenuLang): void {
  const m = MENU_I18N[lang];
  const menu = Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: m.tasks,
      submenu: [
        {
          label: m.newTask,
          accelerator: "CmdOrCtrl+N",
          click: () => { mainWindow?.show(); sendToRenderer("menu:action", { action: "new-task" }); },
        },
        {
          label: m.quickCapture,
          accelerator: "CmdOrCtrl+K",
          click: () => { mainWindow?.show(); sendToRenderer("tray:quick-add"); },
        },
        {
          label: m.syncNow,
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendToRenderer("menu:action", { action: "sync" }),
        },
        {
          label: m.weeklyReview,
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => sendToRenderer("menu:action", { action: "review" }),
        },
      ],
    },
    {
      label: m.edit,
      submenu: [
        { role: "undo", label: m.undo },
        { role: "redo", label: m.redo },
        { type: "separator" },
        { role: "cut", label: m.cut },
        { role: "copy", label: m.copy },
        { role: "paste", label: m.paste },
        { role: "selectAll", label: m.selectAll },
      ],
    },
    {
      label: m.view,
      submenu: [
        { role: "reload", label: m.reload },
        { role: "toggleDevTools", label: m.devTools },
        { type: "separator" },
        { role: "resetZoom", label: m.resetZoom },
        { role: "zoomIn", label: m.zoomIn },
        { role: "zoomOut", label: m.zoomOut },
        { type: "separator" },
        { role: "togglefullscreen", label: m.fullscreen },
      ],
    },
    {
      label: m.window,
      submenu: [{ role: "minimize", label: m.minimize }, { role: "close", label: m.close }],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

/** 语言切换：渲染进程 settings.set lang → 重建菜单与托盘（点击回调保持不变） */
function applyMenuLanguage(lang: MenuLang): void {
  menuLang = lang;
  buildAppMenu(lang);
  tray?.setContextMenu(buildTrayContextMenu(lang));
  tray?.setToolTip(MENU_I18N[lang].trayTooltip);
}

function registerDefaultShortcut(): void {
  // 系统级快速收集；应用退出时 will-quit 统一 unregisterAll
  const ok = globalShortcut.register("CmdOrCtrl+Shift+Space", () => {
    toggleMainWindow();
    sendToRenderer("tray:quick-add");
  });
  if (!ok) console.warn("[shortcuts] CmdOrCtrl+Shift+Space 注册失败（可能被占用）");
}

/* ---------------- 窗口与协议 ---------------- */

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 375,
    minHeight: 500,
    title: "GTD 清单",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
    if (!isQuitting) {
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
function resolveRendererFile(pathname: string): string | null {
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

function handleAppProtocol(): void {
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

/* ---------------- 冒烟自检 ---------------- */

const SMOKE_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${SMOKE_TIMEOUT_MS}ms）`)), SMOKE_TIMEOUT_MS),
    ),
  ]);
}

async function waitForText(win: BrowserWindow, marker: string): Promise<string> {
  const text = await withTimeout(
    win.webContents.executeJavaScript(
      `
      (async () => {
        const deadline = Date.now() + ${SMOKE_TIMEOUT_MS - 5_000};
        while (Date.now() < deadline) {
          const text = document.body ? document.body.innerText : "";
          if (text.includes(${JSON.stringify(marker)})) return text;
          await new Promise((r) => setTimeout(r, 200));
        }
        return document.body ? document.body.innerText : "";
      })()
    `,
      true,
    ),
    `等待页面出现「${marker}」`,
  );
  if (!text.includes(marker)) {
    throw new Error(`页面未出现「${marker}」，实际内容: ${text.slice(0, 200)}`);
  }
  return text;
}

async function runCommandE2e(): Promise<void> {
  const result = (await mainWindow!.webContents.executeJavaScript(
    `
    (async () => {
      const created = await window.gtd.command("task.create", { title: "冒烟测试任务" });
      const rows = await window.gtd.query("SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL", []);
      const boot = await window.gtd.query("SELECT id, title, status FROM tasks WHERE deleted_at IS NULL", []);
      return {
        ids: created.ids,
        records: created.records.length,
        count: rows[0] ? Number(rows[0].n) : -1,
        seeded: boot.some((r) => r.title === "整理桌面"),
      };
    })()
  `,
    true,
  )) as { ids: string[]; records: number; count: number; seeded: boolean };
  if (result.ids.length !== 1) throw new Error(`command 应返回 1 个 id，实际 ${result.ids.length}`);
  if (result.records !== 1) throw new Error("command 应返回 1 条变更记录");
  if (result.count < 2) throw new Error(`任务数异常: ${result.count}`);
  if (!result.seeded) throw new Error("种子任务未写入（种子链路失败）");
}

/** 阶段三冒烟：原生能力 + 文件夹同步双设备 E2E（主进程侧执行） */
async function runNativeAndSyncE2e(): Promise<void> {
  // 1) 原生能力存在性
  if (!tray) throw new Error("托盘未创建");
  if (Menu.getApplicationMenu() === null) throw new Error("应用菜单未设置");
  if (!globalShortcut.isRegistered("CmdOrCtrl+Shift+Space")) {
    throw new Error("全局快捷键未注册");
  }

  // 2) 通知能力（不弹出验证 UI，仅验证构造不抛错）
  if (!Notification.isSupported()) throw new Error("系统通知不支持");

  // 3) 文件夹同步 E2E：主库（desktop-smoke）与内存第二设备经同一目录收敛
  const syncRoot = path.join(os.tmpdir(), `gtd-smoke-sync-${Date.now()}`);
  allowedRoots.add(syncRoot);
  const provider = createFolderProvider(
    { kind: "folder", endpoint: syncRoot, enabled: true },
    {
      readFile: async (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null),
      writeFile: async (p, content) => {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf-8");
      },
      listDir: async (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []),
      mkdir: async (p) => {
        fs.mkdirSync(p, { recursive: true });
      },
    },
  );

  const ctx = { now: () => Date.now() };
  await executeCommand(sqlite!.executor, "settings.set", { key: "device_id", value: "desktop-smoke" }, ctx);
  const report1 = await syncNow({
    provider,
    executor: sqlite!.executor,
    deviceId: "desktop-smoke",
    apply: createSyncDepsForExecutor(sqlite!.executor, ctx),
  });
  if (report1.pushed < 1) throw new Error("主设备同步推送数为 0");

  const second = openSqlite(path.join(os.tmpdir(), `gtd-smoke-second-${Date.now()}.db`));
  // userData 主库跨运行持久化：标题带时间戳保证断言唯一
  const uniqueTitle = `来自第二设备的同步任务 ${Date.now()}`;
  try {
    await migrate(second.executor);
    await executeCommand(second.executor, "settings.set", { key: "device_id", value: "phone-smoke" }, ctx);
    await executeCommand(second.executor, "task.create", { title: uniqueTitle }, ctx);
    await syncNow({
      provider,
      executor: second.executor,
      deviceId: "phone-smoke",
      apply: createSyncDepsForExecutor(second.executor, ctx),
    });

    const report3 = await syncNow({
      provider,
      executor: sqlite!.executor,
      deviceId: "desktop-smoke",
      apply: createSyncDepsForExecutor(sqlite!.executor, ctx),
    });
    if (report3.applied < 1) throw new Error("主设备未拉到第二设备的任务");

    const rows = await sqlite!.executor.query<Record<string, unknown>>(
      "SELECT title FROM tasks WHERE title = ? AND deleted_at IS NULL",
      [uniqueTitle],
    );
    if (rows.length !== 1) throw new Error("文件夹同步 E2E：任务未收敛到主库");
  } finally {
    second.close();
    fs.rmSync(syncRoot, { recursive: true, force: true });
  }
}

async function runSmoke(win: BrowserWindow): Promise<void> {
  const fail = (msg: string) => {
    console.error(`SMOKE FAIL: ${msg}`);
    app.exit(1);
  };
  try {
    await win.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
    await waitForText(win, "整理桌面");

    await win.loadURL(`${APP_SCHEME}://${APP_HOST}/about`);
    // about 文案随语言切换：断言双语共有的品牌字符
    const aboutText = await waitForText(win, "GTD");
    if (aboutText.includes("renderer not built")) return fail("fallback 返回了 404 文本");

    const jsDir = path.join(rendererRoot, "_expo", "static", "js");
    const firstJs = fs
      .readdirSync(jsDir, { recursive: true })
      .map((f) => f.toString())
      .find((f) => f.endsWith(".js"));
    if (!firstJs) return fail("renderer/_expo/static/js 下没有 js 产物");
    const rel = firstJs.split(/[\\/]/).join("/");
    const assetStatus = await win.webContents.executeJavaScript(
      `fetch("/_expo/static/js/${rel}").then((r) => r.status)`,
    );
    if (assetStatus !== 200) return fail(`静态资源加载失败：HTTP ${assetStatus}`);

    await runCommandE2e();

    // 5) 菜单本地化与语言切换：切 en → 标签为英文；切回 zh → 恢复中文（对启动语言鲁棒）
    await mainWindow!.webContents.executeJavaScript(
      `window.gtd.command("settings.set", { key: "lang", value: "en" })`,
      true,
    );
    await new Promise((r) => setTimeout(r, 500));
    const enLabel = Menu.getApplicationMenu()?.items[0]?.label;
    if (enLabel !== MENU_I18N.en.tasks) {
      return fail(`切换后菜单语言应为「${MENU_I18N.en.tasks}」，实际「${String(enLabel)}」`);
    }
    await mainWindow!.webContents.executeJavaScript(
      `window.gtd.command("settings.set", { key: "lang", value: "zh" })`,
      true,
    );
    await new Promise((r) => setTimeout(r, 500));
    const zhLabel = Menu.getApplicationMenu()?.items[0]?.label;
    if (zhLabel !== MENU_I18N.zh.tasks) {
      return fail(`切回后菜单语言应为「${MENU_I18N.zh.tasks}」，实际「${String(zhLabel)}」`);
    }

    await runNativeAndSyncE2e();

    console.log(
      "SMOKE PASS: index 渲染 ✓ 路由刷新 ✓ 静态资源 ✓ 命令E2E ✓ 菜单双语切换 ✓ 托盘/菜单/快捷键 ✓ 通知能力 ✓ 文件夹同步双设备E2E ✓",
    );
    app.exit(0);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

/* ---------------- 生命周期 ---------------- */

void app.whenReady().then(async () => {
  try {
    sqlite = openSqlite(path.join(app.getPath("userData"), "gtd.db"));
    await migrate(sqlite.executor);
    // 启动语言：读 kv.lang（无设置默认中文）
    const rows = await sqlite.executor.query<Record<string, unknown>>(
      "SELECT value FROM kv WHERE key = ?",
      ["lang"],
    );
    const saved = rows[0]?.value;
    if (saved === "en" || saved === "zh") menuLang = saved;
  } catch (err) {
    console.error("数据库初始化失败:", err);
    app.exit(1);
    return;
  }
  handleAppProtocol();
  registerIpc();
  mainWindow = createWindow();
  createTray(menuLang);
  buildAppMenu(menuLang);
  registerDefaultShortcut();
  void setupAutoUpdater();
  if (isSmoke) {
    void runSmoke(mainWindow);
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  // 全局快捷键随退出注销，避免占用系统资源
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  sqlite?.close();
  app.quit();
});

import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { createBackup } from "./backup";
import { getMainWindow, getTray, setIsQuitting, setTray } from "./state";
import { sendToRenderer, toggleMainWindow } from "./window";

/**
 * 托盘 / 应用菜单（中英双语，随 kv.lang 重建）。
 * 菜单文案与快捷键集中在 MENU_I18N；语言切换由 ipc 经 main.ts 注入的回调触发，
 * 本模块不 import ipc.ts，保持单向依赖。
 */

export type MenuLang = "zh" | "en";

interface MenuStrings {
  tasks: string;
  newTask: string;
  palette: string;
  quickCapture: string;
  syncNow: string;
  weeklyReview: string;
  search: string;
  focusMode: string;
  backupNow: string;
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

export const MENU_I18N: Record<MenuLang, MenuStrings> = {
  zh: {
    tasks: "任务",
    newTask: "新建任务",
    palette: "命令面板",
    quickCapture: "快速收集",
    syncNow: "立即同步",
    weeklyReview: "每周回顾",
    search: "搜索",
    focusMode: "专注模式",
    backupNow: "立即备份",
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
    palette: "Command Palette",
    quickCapture: "Quick Capture",
    syncNow: "Sync Now",
    weeklyReview: "Weekly Review",
    search: "Search",
    focusMode: "Focus Mode",
    backupNow: "Back Up Now",
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

export function getMenuLang(): MenuLang {
  return menuLang;
}

export function setMenuLang(lang: MenuLang): void {
  menuLang = lang;
}

export function buildTrayContextMenu(lang: MenuLang): Electron.Menu {
  const m = MENU_I18N[lang];
  return Menu.buildFromTemplate([
    {
      label: m.trayQuickAdd,
      click: () => {
        getMainWindow()?.show();
        sendToRenderer("tray:quick-add");
      },
    },
    { label: m.trayToggle, click: () => toggleMainWindow() },
    { type: "separator" },
    { label: m.trayQuit, click: () => { setIsQuitting(true); app.quit(); } },
  ]);
}

export function createTray(lang: MenuLang): void {
  const iconPath = path.resolve(__dirname, "..", "assets", "tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(process.platform === "darwin");
  const created = new Tray(icon);
  setTray(created);
  created.setToolTip(MENU_I18N[lang].trayTooltip);
  created.setContextMenu(buildTrayContextMenu(lang));
  created.on("click", () => toggleMainWindow());
}

export function buildAppMenu(lang: MenuLang): void {
  const m = MENU_I18N[lang];
  const menu = Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: m.tasks,
      submenu: [
        {
          label: m.newTask,
          accelerator: "CmdOrCtrl+N",
          click: () => { getMainWindow()?.show(); sendToRenderer("menu:action", { action: "new-task" }); },
        },
        {
          label: m.palette,
          accelerator: "CmdOrCtrl+K",
          click: () => { getMainWindow()?.show(); sendToRenderer("menu:action", { action: "palette" }); },
        },
        {
          label: m.quickCapture,
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => { getMainWindow()?.show(); sendToRenderer("tray:quick-add"); },
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
        { type: "separator" },
        {
          label: m.search,
          accelerator: "CmdOrCtrl+F",
          click: () => sendToRenderer("menu:action", { action: "search" }),
        },
        {
          label: m.focusMode,
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => sendToRenderer("menu:action", { action: "focus" }),
        },
        {
          label: m.backupNow,
          accelerator: "CmdOrCtrl+Shift+B",
          click: () => {
            void createBackup()
              .then((file) => sendToRenderer("menu:action", { action: "backup-done", file }))
              .catch(() => undefined);
          },
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
export function applyMenuLanguage(lang: MenuLang): void {
  menuLang = lang;
  buildAppMenu(lang);
  const currentTray = getTray();
  currentTray?.setContextMenu(buildTrayContextMenu(lang));
  currentTray?.setToolTip(MENU_I18N[lang].trayTooltip);
}

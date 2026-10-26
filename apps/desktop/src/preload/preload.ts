import { contextBridge, ipcRenderer } from "electron";

/**
 * preload：经 contextBridge 暴露类型化 window.gtd。
 * 全部参数可结构化克隆；事件通道白名单校验。
 * 写路径唯一入口 command(op, payload)；读走 query（主进程校验 SELECT-only）；
 * 原生能力（托盘/快捷键/通知/菜单/dialog/fs）经对应通道。
 */

const EVENT_CHANNELS = [
  "tray:quick-add",
  "shortcut:triggered",
  "notification:click",
  "menu:action",
  "window:focusChange",
  "command:applied",
] as const;

const api = {
  command: (op: string, payload: unknown) => ipcRenderer.invoke("command", op, payload),
  query: (sql: string, params?: readonly unknown[]) => ipcRenderer.invoke("query", sql, params),
  window: {
    show: () => ipcRenderer.invoke("window:show"),
    hide: () => ipcRenderer.invoke("window:hide"),
    toggle: () => ipcRenderer.invoke("window:toggle"),
    minimizeToTray: () => ipcRenderer.invoke("window:minimizeToTray"),
  },
  shortcuts: {
    register: (accelerator: string, actionId: string) =>
      ipcRenderer.invoke("shortcuts:register", accelerator, actionId),
  },
  notify: (payload: { title: string; body: string; taskId?: string }) =>
    ipcRenderer.invoke("notify", payload),
  dialog: {
    open: (options?: { directory?: boolean; filters?: unknown }) =>
      ipcRenderer.invoke("dialog:open", options ?? {}),
    save: (options?: { defaultPath?: string }) => ipcRenderer.invoke("dialog:save", options ?? {}),
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke("fs:readFile", path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke("fs:writeFile", path, content),
    listDir: (path: string) => ipcRenderer.invoke("fs:listDir", path),
  },
  sync: {
    setFolderRoot: (root: string) => ipcRenderer.invoke("sync:setFolderRoot", root),
  },
  backup: {
    now: () => ipcRenderer.invoke("backup:now"),
    list: () => ipcRenderer.invoke("backup:list"),
    restore: () => ipcRenderer.invoke("backup:restore"),
  },
  app: {
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
    quit: () => ipcRenderer.invoke("app:quit"),
  },
  on: (channel: (typeof EVENT_CHANNELS)[number], listener: (...args: unknown[]) => void) => {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`事件通道不在白名单: ${channel}`);
    }
    const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("gtd", api);

export type GtdBridge = typeof api;

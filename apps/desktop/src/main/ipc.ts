import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  safeStorage,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import type { CommandOp } from "@gtd/core";
import { executeCommand } from "@gtd/core";
import { createBackup, listBackups, restoreLatestBackup } from "./backup";
import {
  allowedRoots,
  getMainWindow,
  getSqlite,
  setIsQuitting,
} from "./state";

/**
 * 数据与原生能力 IPC：command/query（含命令白名单与串行队列）、fs 白名单、
 * dialog/notify/shortcuts/window/menu:context/secret/backup/sync:setFolderRoot/app:getInfo。
 * 通道名、参数顺序、返回结构必须与 preload 契约保持一致。
 * 语言切换通过 main.ts 注入的回调重建菜单（不 import menu.ts 的实现，避免循环依赖）。
 */

/* ---------------- 数据 IPC ---------------- */

const COMMAND_OP_FLAG: { [K in CommandOp]: true } = {
  "task.create": true,
  "task.update": true,
  "task.moveStatus": true,
  "task.reorder": true,
  "task.complete": true,
  "task.uncomplete": true,
  "task.softDelete": true,
  "task.restore": true,
  "project.upsert": true,
  "project.softDelete": true,
  "project.markReviewed": true,
  "template.upsert": true,
  "template.softDelete": true,
  "template.instantiate": true,
  "context.upsert": true,
  "section.create": true,
  "area.upsert": true,
  "area.softDelete": true,
  "attachment.add": true,
  "attachment.remove": true,
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

function assertAllowedPath(target: string): string {
  const resolved = path.resolve(target);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  }
  throw new Error(`路径不在允许范围内: ${resolved}`);
}

/** 壳层语言（与 menu.MenuLang 同构；此处只约定回调签名，不 import menu.ts） */
type ShellLang = "zh" | "en";

let applyMenuLanguageHandler: ((lang: ShellLang) => void) | null = null;

/** 由 main.ts 注入：settings.set lang 后重建菜单/托盘的壳层回调 */
export function setMenuLanguageHandler(fn: (lang: ShellLang) => void): void {
  applyMenuLanguageHandler = fn;
}

export function registerIpc(): void {
  ipcMain.handle("command", (_event, op: unknown, payload: unknown) => {
    if (typeof op !== "string" || !COMMAND_OPS.includes(op as CommandOp)) {
      throw new Error(`未注册的命令: ${String(op)}`);
    }
    if (typeof payload !== "object" || payload === null) {
      throw new Error("payload 必须是对象");
    }
    const result = enqueueDb(() =>
      executeCommand(getSqlite()!.executor, op as CommandOp, payload, { now: () => Date.now() }),
    );
    // 语言设置：kv 持久化后即时重建菜单/托盘（壳层本地化不依赖渲染进程）
    if (op === "settings.set") {
      const p = payload as { key?: unknown; value?: unknown };
      if (p.key === "lang" && (p.value === "zh" || p.value === "en")) {
        void result.then(() => applyMenuLanguageHandler?.(p.value as ShellLang));
      }
    }
    return result;
  });
  ipcMain.handle("query", (_event, sql: unknown, params: unknown) => {
    if (typeof sql !== "string") throw new Error("sql 必须是字符串");
    assertReadOnly(sql);
    const list = Array.isArray(params) ? (params as unknown[]) : [];
    return enqueueDb(() => getSqlite()!.executor.query(sql, list));
  });

  // ---- 原生能力 IPC（阶段三）----
  ipcMain.handle("shortcuts:register", (_event, accelerator: unknown, actionId: unknown) => {
    if (typeof accelerator !== "string" || typeof actionId !== "string") {
      throw new Error("accelerator/actionId 必须是字符串");
    }
    return globalShortcut.register(accelerator, () => {
      getMainWindow()?.webContents.send("shortcut:triggered", { actionId });
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
      const win = getMainWindow();
      win?.show();
      win?.focus();
      win?.webContents.send("notification:click", { taskId: p.taskId });
    });
    notification.show();
    return true;
  });
  ipcMain.handle("dialog:open", async (_event, options: unknown) => {
    const o = (options ?? {}) as { directory?: boolean };
    const props: Electron.OpenDialogOptions["properties"] =
      o.directory === true ? ["openDirectory"] : ["openFile"];
    const result = await dialog.showOpenDialog(getMainWindow()!, { properties: props });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0] as string;
    // 选定即授权：目录作同步根；文件以其所在目录为读取根
    allowedRoots.add(o.directory === true ? path.resolve(picked) : path.dirname(path.resolve(picked)));
    return picked;
  });
  ipcMain.handle("dialog:save", async (_event, options: unknown) => {
    const o = (options ?? {}) as { defaultPath?: unknown };
    const result = await dialog.showSaveDialog(getMainWindow()!, {
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

  /* ---- 敏感凭据加密：safeStorage（Windows DPAPI / macOS Keychain / Linux libsecret） ---- */
  ipcMain.handle("secret:encrypt", (_event, plaintext: unknown) => {
    if (typeof plaintext !== "string") throw new Error("plaintext 必须是字符串");
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[secret] 系统加密不可用，降级为 base64");
      return "b64:" + Buffer.from(plaintext, "utf-8").toString("base64");
    }
    return "enc:" + safeStorage.encryptString(plaintext).toString("base64");
  });
  ipcMain.handle("secret:decrypt", (_event, ciphertext: unknown) => {
    if (typeof ciphertext !== "string") throw new Error("ciphertext 必须是字符串");
    if (ciphertext.startsWith("b64:")) {
      return Buffer.from(ciphertext.slice(4), "base64").toString("utf-8");
    }
    if (ciphertext.startsWith("enc:")) {
      return safeStorage.decryptString(Buffer.from(ciphertext.slice(4), "base64"));
    }
    // 未加密旧数据：原样返回（首次读取后会被重新加密写回）
    return ciphertext;
  });

  /**
   * 原生右键菜单：渲染端传菜单项（id/label/enabled），主进程用 Menu.popup 弹系统菜单，
   * 选中后回传 id。菜单内容由渲染端决定（那里知道当前任务状态），主进程只负责展示。
   */
  ipcMain.handle("menu:context", async (event, payload: unknown) => {
    const p = payload as {
      items?: { id?: unknown; label?: unknown; enabled?: unknown; type?: unknown }[];
      x?: unknown;
      y?: unknown;
    };
    if (!Array.isArray(p?.items) || p.items.length === 0) return null;

    const sanitize = (value: unknown, max: number) =>
      typeof value === "string" ? value.slice(0, max) : "";

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (id: string | null) => {
        if (settled) return;
        settled = true;
        resolve(id);
      };

      const template: Electron.MenuItemConstructorOptions[] = [];
      for (const raw of p.items ?? []) {
        if (raw?.type === "separator") {
          template.push({ type: "separator" });
          continue;
        }
        const id = sanitize(raw?.id, 64);
        const label = sanitize(raw?.label, 120);
        if (id.length === 0 || label.length === 0) continue;
        template.push({
          id,
          label,
          enabled: raw?.enabled !== false,
          click: () => finish(id),
        });
      }
      if (template.length === 0) {
        finish(null);
        return;
      }

      const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: win ?? undefined,
        x: typeof p.x === "number" ? Math.round(p.x) : undefined,
        y: typeof p.y === "number" ? Math.round(p.y) : undefined,
        // 点击空白关闭时也要 resolve，否则渲染端 await 悬挂
        callback: () => finish(null),
      });
    });
  });

  /* ---- 本地备份：VACUUM INTO 快照（一致性快照，无需停库） ---- */
  ipcMain.handle("backup:now", () =>
    enqueueDb(async () => {
      try {
        const file = await createBackup();
        return { ok: true, file, count: listBackups().length };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  ipcMain.handle("backup:list", () => ({ count: listBackups().length, latest: listBackups()[0] ?? null }));
  ipcMain.handle("backup:restore", async () => {
    try {
      const restored = restoreLatestBackup();
      if (restored === null) return { ok: false, error: "no-backup" };
      // 关闭数据库并重启，让新数据生效
      setTimeout(() => {
        getSqlite()?.close();
        app.relaunch();
        app.exit(0);
      }, 200);
      return { ok: true, file: restored };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("app:quit", () => {
    setIsQuitting(true);
    app.quit();
  });
  ipcMain.handle("window:show", () => {
    getMainWindow()?.show();
    getMainWindow()?.focus();
  });
  ipcMain.handle("window:hide", () => getMainWindow()?.hide());
  ipcMain.handle("window:toggle", () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
  ipcMain.handle("window:minimizeToTray", () => getMainWindow()?.hide());
  ipcMain.handle("app:getInfo", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
  }));
}

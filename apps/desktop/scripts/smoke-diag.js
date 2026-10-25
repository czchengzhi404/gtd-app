// 诊断脚本 v2：完整复刻 main.ts 的窗口配置（含 preload），监听 IPC 到达与错误
const { app, BrowserWindow, protocol, net, ipcMain } = require("electron");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

const rendererRoot = path.resolve(__dirname, "..", "renderer");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname.split("?")[0]).replace(/^\/+/, "");
    let file = null;
    if (rel.length > 0) {
      const candidate = path.resolve(rendererRoot, rel);
      if (candidate.startsWith(rendererRoot) && fs.existsSync(candidate)) file = candidate;
    }
    return net.fetch(pathToFileURL(file ?? path.join(rendererRoot, "index.html")).toString());
  });

  // 观测 IPC：是否到达主进程、是否抛错
  for (const ch of ["command", "query"]) {
    ipcMain.on(ch, (_e, ...args) => console.log(`[IPC>${ch}]`, JSON.stringify(args).slice(0, 120)));
    ipcMain.handle(ch, (_e, ...args) => {
      console.log(`[IPC>${ch}:handle]`, JSON.stringify(args).slice(0, 120));
      try {
        const result = ch === "query"
          ? Promise.resolve([{ value: "1" }])
          : Promise.resolve({ ids: [], records: [], serverTime: Date.now() });
        return result;
      } catch (err) {
        console.log(`[IPC>${ch}:ERR]`, err && err.message);
        throw err;
      }
    });
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "dist-electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.log(`[R${level}]`, message.slice(0, 400));
  });
  void win.loadURL("app://gtd/").then(async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const text = await win.webContents
        .executeJavaScript("document.body ? document.body.innerText : 'NOBODY'", true)
        .catch((err) => "ERR:" + err.message);
      console.log(`=== ${i} BODY >>>`, JSON.stringify(text.slice(0, 200)));
    }
    const probe = await win.webContents
      .executeJavaScript(
        `(() => ({ hasGtd: typeof window.gtd !== "undefined", keys: typeof window.gtd !== "undefined" ? Object.keys(window.gtd) : [] }))()`,
        true,
      )
      .catch((err) => "ERR:" + err.message);
    console.log("PROBE>>>", JSON.stringify(probe));
    app.exit(0);
  });
});

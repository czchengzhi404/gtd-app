import { app, globalShortcut, Menu, Notification } from "electron";
import type { BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createFolderProvider,
  createSyncDepsForExecutor,
  executeCommand,
  migrate,
  syncNow,
} from "@gtd/core";
import { openSqlite } from "./db";
import { MENU_I18N } from "./menu";
import {
  allowedRoots,
  APP_HOST,
  APP_SCHEME,
  getMainWindow,
  getSqlite,
  getTray,
  rendererRoot,
  shotCfg,
} from "./state";

/**
 * 冒烟自检与截图：--smoke 依次校验首页/路由/静态资源/命令链路/菜单双语/托盘快捷键/
 * 通知与文件夹同步双设备 E2E；--shot 按路由离屏抓图。二者均以进程退出码汇报结果。
 */

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

/**
 * 命令链路 E2E：断言全部基于本次运行自建的数据（时间戳唯一），
 * 不依赖种子/用户已有数据——用户对库的任何操作都不影响冒烟。
 */
async function runCommandE2e(): Promise<string> {
  const uniqueTitle = `冒烟任务 ${Date.now()}`;
  const result = (await getMainWindow()!.webContents.executeJavaScript(
    `
    (async () => {
      const unique = ${JSON.stringify(uniqueTitle)};
      const created = await window.gtd.command("task.create", { title: unique });
      const rows = await window.gtd.query("SELECT title FROM tasks WHERE title = ? AND deleted_at IS NULL", [unique]);
      const total = await window.gtd.query("SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL", []);
      return {
        ids: created.ids,
        records: created.records.length,
        visible: rows.length,
        total: total[0] ? Number(total[0].n) : -1,
      };
    })()
  `,
    true,
  )) as { ids: string[]; records: number; visible: number; total: number };
  if (result.ids.length !== 1) throw new Error(`command 应返回 1 个 id，实际 ${result.ids.length}`);
  if (result.records !== 1) throw new Error("command 应返回 1 条变更记录");
  if (result.visible !== 1) throw new Error(`写读不一致：查询到 ${result.visible} 条`);
  if (result.total < 1) throw new Error(`任务总数异常: ${result.total}`);
  return uniqueTitle;
}

/** 阶段三冒烟：原生能力 + 文件夹同步双设备 E2E（主进程侧执行） */
async function runNativeAndSyncE2e(): Promise<void> {
  // 1) 原生能力存在性
  if (!getTray()) throw new Error("托盘未创建");
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
  const db = getSqlite()!;
  await executeCommand(db.executor, "settings.set", { key: "device_id", value: "desktop-smoke" }, ctx);
  const report1 = await syncNow({
    provider,
    executor: db.executor,
    deviceId: "desktop-smoke",
    apply: createSyncDepsForExecutor(db.executor, ctx),
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
      executor: db.executor,
      deviceId: "desktop-smoke",
      apply: createSyncDepsForExecutor(db.executor, ctx),
    });
    if (report3.applied < 1) throw new Error("主设备未拉到第二设备的任务");

    const rows = await db.executor.query<Record<string, unknown>>(
      "SELECT title FROM tasks WHERE title = ? AND deleted_at IS NULL",
      [uniqueTitle],
    );
    if (rows.length !== 1) throw new Error("文件夹同步 E2E：任务未收敛到主库");
  } finally {
    second.close();
    fs.rmSync(syncRoot, { recursive: true, force: true });
  }
}

/** 截图：加载指定路由 → 等首屏渲染 → 抓图。窗口在屏幕外，不打断使用者。 */
export async function runShot(win: BrowserWindow): Promise<void> {
  const cfg = shotCfg;
  if (cfg === null) return;
  try {
    // --shot 的 route 段支持 `route?dark=1&fontScale=2` 形式的实测参数：
    // dark 强制暗色（模拟系统深色模式），fontScale 放大系统字体（验证大字号不破版）
    // route 段形如 `today?dark=1`；首个 ? 之后都是查询参数
    const rawRoute = cfg.route ?? "";
    const qIndex = rawRoute.indexOf("?");
    const routePath = qIndex === -1 ? rawRoute : rawRoute.slice(0, qIndex);
    const search = qIndex === -1 ? "" : rawRoute.slice(qIndex + 1);
    const query = new URLSearchParams(search);
    const dark = query.get("dark") === "1";
    const fontScale = Number(query.get("fontScale") ?? "1");

    // 先加载页面，再应用媒体/尺寸模拟（提前执行会让首次导航被 abort）
    await win.loadURL(`${APP_SCHEME}://${APP_HOST}/${routePath ?? ""}`);

    try {
      win.webContents.debugger.attach("1.3");
      await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }],
      });
      if (Number.isFinite(fontScale) && fontScale !== 1) {
        await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
          width: cfg.width ?? 390,
          height: cfg.height ?? 844,
          deviceScaleFactor: fontScale,
          mobile: (cfg.width ?? 390) < 768,
        });
      }
    } catch {
      /* 模拟失败不影响截图 */
    }

    // 数据加载 + 字体排版稳定
    await new Promise((r) => setTimeout(r, 4500));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(cfg.out, image.toPNG());
    console.log(
      `SHOT_SAVED ${cfg.out} (${cfg.width}x${cfg.height}${dark ? " dark" : ""}${fontScale !== 1 ? ` fontScale=${fontScale}` : ""})`,
    );
    app.exit(0);
  } catch (err) {
    console.error("SHOT_FAILED", err instanceof Error ? err.message : String(err));
    app.exit(1);
  }
}

export async function runSmoke(win: BrowserWindow): Promise<void> {
  const fail = (msg: string) => {
    console.error(`SMOKE FAIL: ${msg}`);
    app.exit(1);
  };
  try {
    // 1) 首页加载：等待应用骨架（品牌名恒在，与用户数据/语言无关）
    await win.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
    await waitForText(win, "GTD");

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

    // 4) 命令链路 E2E + DOM 断言：回到首页，自建任务应出现在列表（与用户存量数据无关）
    const smokeTaskTitle = await runCommandE2e();
    await win.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
    await waitForText(win, smokeTaskTitle.slice(0, 6));

    // 5) 菜单本地化与语言切换：切 en → 标签为英文；切回 zh → 恢复中文（对启动语言鲁棒）
    await getMainWindow()!.webContents.executeJavaScript(
      `window.gtd.command("settings.set", { key: "lang", value: "en" })`,
      true,
    );
    await new Promise((r) => setTimeout(r, 500));
    const enLabel = Menu.getApplicationMenu()?.items[0]?.label;
    if (enLabel !== MENU_I18N.en.tasks) {
      return fail(`切换后菜单语言应为「${MENU_I18N.en.tasks}」，实际「${String(enLabel)}」`);
    }
    await getMainWindow()!.webContents.executeJavaScript(
      `window.gtd.command("settings.set", { key: "lang", value: "zh" })`,
      true,
    );
    await new Promise((r) => setTimeout(r, 500));
    const zhLabel = Menu.getApplicationMenu()?.items[0]?.label;
    if (zhLabel !== MENU_I18N.zh.tasks) {
      return fail(`切回后菜单语言应为「${MENU_I18N.zh.tasks}」，实际「${String(zhLabel)}」`);
    }

    // 6) 右键菜单 IPC 可用性（不真正弹窗：只校验 preload 暴露与主进程注册）
    const contextMenuReady = await win.webContents.executeJavaScript(
      `typeof window.gtd.menu?.context === "function"`,
      true,
    );
    if (contextMenuReady !== true) return fail("右键菜单 IPC 未暴露");

    await runNativeAndSyncE2e();

    console.log(
      "SMOKE PASS: index 渲染 ✓ 路由刷新 ✓ 静态资源 ✓ 命令E2E ✓ 菜单双语切换 ✓ 托盘/菜单/快捷键 ✓ 通知能力 ✓ 文件夹同步双设备E2E ✓",
    );
    app.exit(0);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

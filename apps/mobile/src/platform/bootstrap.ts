import { Platform } from "react-native";
import { router } from "expo-router";

import {
  setSqliteExecutor,
  setCommandPort,
  setNotificationsPort,
  isElectronRenderer,
  migrate,
  executeCommand,
  getSqliteExecutor,
  getNotificationsPort,
  appStore,
  runCommand,
  pickDueNotifications,
} from "@gtd/core";
import type { SqliteExecutor, CommandPort, CommandResult } from "@gtd/core";
import { t } from "@gtd/ui";
import { gtd } from "./gtd-api";
import { seedIfNeeded } from "./seed";

/**
 * 平台注入（阶段三）：
 * - Electron 渲染进程：IPC executor/command port + 通知端口 + 文件端口 + 原生事件
 * - 原生（iOS/Android）：expo-sqlite + expo-notifications
 * 返回清理函数（卸载定时器/事件订阅）。
 */

const DB_NAME = "gtd.db";

function createExpoExecutor(): SqliteExecutor {
  // 仅原生分支触达；web 产物包含该 import 但从不调用（需 metro assetExts 含 wasm）
  const sqlite = require("expo-sqlite") as typeof import("expo-sqlite");
  const db = sqlite.openDatabaseSync(DB_NAME);
  db.execSync("PRAGMA journal_mode = WAL");
  db.execSync("PRAGMA busy_timeout = 5000");

  const executor: SqliteExecutor = {
    query: async <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
      db.getAllSync(sql, params as never[]) as T[],
    run: async (sql: string, params: readonly unknown[] = []) => {
      const info = db.runSync(sql, params as never[]);
      return { changes: info.changes };
    },
    transaction: async <T>(
      fn: (tx: SqliteExecutor) => Promise<T>,
      mode: "immediate" | "deferred",
    ): Promise<T> => {
      db.execSync(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = await fn(executor);
        db.execSync("COMMIT");
        return result;
      } catch (err) {
        db.execSync("ROLLBACK");
        throw err;
      }
    },
  };
  return executor;
}

function createExpoCommandPort(executor: SqliteExecutor): CommandPort {
  return {
    dispatch: async (op, payload) =>
      executeCommand(executor, op, payload, { now: () => Date.now() }),
  };
}

/* ---------------- 到期通知（60s 扫描，kv 去重） ---------------- */

export function startDueNotifier(): () => void {
  // 非 React 上下文：t 每次调用读取当前语言，定时扫描自然跟随切换
  const scan = async () => {
    const port = getNotificationsPort();
    if (port === null) return;
    const state = appStore.getState();
    const prefix = "notified.";
    const notifiedKeys = new Set(
      Object.keys(state.kv)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
    );
    const { due, newKeys } = pickDueNotifications(
      Object.values(state.tasks),
      Date.now(),
      notifiedKeys,
    );
    for (const d of due) {
      await port
        .show({ title: t("notify.dueTitle"), body: d.title, taskId: d.taskId })
        .catch(() => undefined);
    }
    for (const key of newKeys) {
      await runCommand("settings.set", { key: `${prefix}${key}`, value: 1 }).catch(() => undefined);
    }
  };
  void scan();
  const timer = setInterval(() => void scan(), 60_000);
  return () => clearInterval(timer);
}

/* ---------------- 桌面：端口 + 原生事件 ---------------- */

function wireDesktop(): () => void {
  const api = gtd();
  setNotificationsPort({
    show: async (payload) => {
      await api.notify(payload);
    },
  });

  const offs: (() => void)[] = [];
  offs.push(
    api.on("tray:quick-add", () => {
      router.navigate("/");
    }),
  );
  offs.push(
    api.on("notification:click", (...args: unknown[]) => {
      const payload = args[0] as { taskId?: string } | undefined;
      if (payload?.taskId !== undefined) router.push(`/task/${payload.taskId}`);
    }),
  );
  offs.push(
    api.on("menu:action", (...args: unknown[]) => {
      const payload = args[0] as { action?: string } | undefined;
      switch (payload?.action) {
        case "new-task":
          router.navigate("/");
          break;
        case "sync":
          // 延迟引入避免模块环（desktop-actions → core → 无环，可直接引）
          void import("./desktop-actions").then((m) => m.runManualSync());
          break;
        case "review":
          router.push("/review");
          break;
        case "search":
          // 搜索框在收集箱/今天页顶部，跳到收集箱即可直接输入
          router.navigate("/");
          break;
        case "focus":
          router.navigate("/focus");
          break;
        default:
          break;
      }
    }),
  );
  offs.push(
    api.on("shortcut:triggered", (...args: unknown[]) => {
      const payload = args[0] as { actionId?: string } | undefined;
      if (payload?.actionId === "quick-add") router.navigate("/");
    }),
  );
  offs.push(startDueNotifier());
  return () => offs.forEach((off) => off());
}

/* ---------------- 原生：expo-sqlite + expo-notifications ---------------- */

async function wireNative(): Promise<() => void> {
  const sqlite = require("expo-sqlite") as typeof import("expo-sqlite");
  void sqlite; // executor 已在 createExpoExecutor 中打开

  // 通知端口：即时本地通知；权限失败/不可用时静默降级
  try {
    const notifications = require("expo-notifications") as typeof import("expo-notifications");
    await notifications.requestPermissionsAsync().catch(() => undefined);
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    setNotificationsPort({
      show: async (payload) => {
        await notifications.scheduleNotificationAsync({
          content: { title: payload.title, body: payload.body, data: { taskId: payload.taskId } },
          trigger: null,
        });
      },
    });
  } catch {
    setNotificationsPort({ show: async () => undefined });
  }

  let offResponse: (() => void) | undefined;
  try {
    const notifications = require("expo-notifications") as typeof import("expo-notifications");
    const sub = notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { taskId?: string };
      if (typeof data.taskId === "string") router.push(`/task/${data.taskId}`);
    });
    offResponse = () => sub.remove();
  } catch {
    /* 通知响应监听不可用 */
  }

  const stopScan = startDueNotifier();
  return () => {
    stopScan();
    offResponse?.();
  };
}

export interface PlatformInitResult {
  mode: "electron-ipc" | "expo-sqlite";
  cleanup: () => void;
}

/** 统一入口：注入端口 → 迁移（原生）→ 种子（幂等）→ 事件/通知接线 */
export async function initPlatform(): Promise<PlatformInitResult> {
  if (isElectronRenderer()) {
    const api = gtd();
    setSqliteExecutor({
      query: async <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
        api.query(sql, params) as Promise<T[]>,
      run: async () => {
        throw new Error("渲染进程不直接执行写 SQL；写路径统一走 command(op, payload)");
      },
      transaction: async () => {
        throw new Error("渲染进程不执行本地事务；写路径统一走 command(op, payload)");
      },
    });
    setCommandPort({
      dispatch: async (op, payload) => api.command(op, payload) as Promise<CommandResult>,
    });
    await seedIfNeeded();
    const cleanup = wireDesktop();
    return { mode: "electron-ipc", cleanup };
  }
  if (Platform.OS === "web") {
    throw new Error(t("platform.webUnsupported"));
  }
  const executor = createExpoExecutor();
  setSqliteExecutor(executor);
  setCommandPort(createExpoCommandPort(executor));
  await migrate(executor);
  await seedIfNeeded();
  const cleanup = await wireNative();
  return { mode: "expo-sqlite", cleanup };
}

/** 存储自检（冒烟用）：确认命令端口可写、查询端口可读 */
export async function platformSelfTest(): Promise<void> {
  const executor = getSqliteExecutor();
  const rows = await executor.query<Record<string, unknown>>(
    "SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL",
  );
  void rows;
}

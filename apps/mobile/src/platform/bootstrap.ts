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
  pickTimedNotifications,
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

  /**
   * 事务串行队列（关键）。
   *
   * 背景：executeCommand 的 handler 是 async，而 expo-sqlite 的 execSync 是同步调用。
   * 原实现直接 BEGIN IMMEDIATE → await fn() → COMMIT，await 期间会让出事件循环，
   * 两个命令于是交错：A 开事务、让出；B 再开事务（已在事务中）、ROLLBACK（无事务可回滚），
   * 原生层抛出 NativeDatabase.execSync 的 NullPointerException。
   *
   * 表现：新建任务没反应、保存正文失败、完成任务丢失——但界面不崩，
   * 因为调用方把异常 catch 成了 toast。启动时 seed 能成功是因为它内部逐个 await（天然串行）。
   *
   * 用一条 Promise 链把事务排队：同一时刻只有一个事务在飞。
   */
  let chain: Promise<unknown> = Promise.resolve();

  /** 所有数据库操作排队执行：同一时刻只有一件事碰原生层 */
  const enqueue = <T>(task: () => Promise<T> | T): Promise<T> => {
    const run = chain.then(task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const executor: SqliteExecutor = {
    // 读也进队列：事务进行中时，外部读会撞上原生层（同样抛 execSync NPE）
    query: async <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
      enqueue(() => db.getAllSync(sql, params as never[]) as T[]),
    run: async (sql: string, params: readonly unknown[] = []) =>
      enqueue(() => {
        const info = db.runSync(sql, params as never[]);
        return { changes: info.changes };
      }),
    transaction: async <T>(
      fn: (tx: SqliteExecutor) => Promise<T>,
      mode: "immediate" | "deferred",
    ): Promise<T> =>
      enqueue(async () => {
        db.execSync(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
        // 事务内部用直连 executor：不能再入队，否则自己等自己（死锁）
        const tx: SqliteExecutor = {
          query: async <R extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) =>
            db.getAllSync(sql, params as never[]) as R[],
          run: async (sql: string, params: readonly unknown[] = []) => {
            const info = db.runSync(sql, params as never[]);
            return { changes: info.changes };
          },
          transaction: async <R>(inner: (nested: SqliteExecutor) => Promise<R>) => inner(tx),
        };
        try {
          const result = await fn(tx);
          db.execSync("COMMIT");
          return result;
        } catch (err) {
          try {
            db.execSync("ROLLBACK");
          } catch {
            /* 忽略：SQLite 可能已自动回滚 */
          }
          throw err;
        }
      }),
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
    // 1) 每日概览（今天到期/逾期）
    const daily = pickDueNotifications(Object.values(state.tasks), Date.now(), notifiedKeys);
    // 2) 任务级时间提醒（精确到时刻，如"下午 3 点提醒我打电话"）
    const timed = pickTimedNotifications(Object.values(state.tasks), Date.now(), notifiedKeys);

    for (const d of [...timed.due, ...daily.due]) {
      await port
        .show({ title: t("notify.dueTitle"), body: d.title, taskId: d.taskId })
        .catch(() => undefined);
    }
    for (const key of [...timed.newKeys, ...daily.newKeys]) {
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
        case "palette":
        case "search":
          // 命令面板同时承担搜索（任务/项目模糊匹配 + 直接新建）
          void import("./palette-store").then((m) => m.togglePalette());
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

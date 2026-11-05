import { AppState } from "react-native";

import { appStore, createAutoSync } from "@gtd/core";
import type { AutoSyncController } from "@gtd/core";

import { runManualSync } from "./desktop-actions";

/**
 * 自动同步接线：把「本地改动 / 回到前台 / 启动」三类信号接到 core 的
 * 纯逻辑调度器（`sync/auto.ts`）上，真正跑同步仍走 `runManualSync`。
 *
 * 开关读 kv：
 * - `sync.config`（enabled=true 才算配置好）
 * - `sync.auto`（"0" 表示只手动；缺省视为开启）
 */

function parseConfig(raw: string | undefined): { enabled?: boolean } | null {
  if (raw === undefined || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as { enabled?: boolean };
  } catch {
    return null;
  }
}

export function isSyncConfigured(): boolean {
  const cfg = parseConfig(appStore.getState().kv["sync.config"]);
  return cfg?.enabled === true;
}

export function isAutoSyncEnabled(): boolean {
  return appStore.getState().kv["sync.auto"] !== "0";
}

let controller: AutoSyncController | null = null;
let stop: (() => void) | null = null;

/**
 * 启动自动同步。返回清理函数；重复调用返回同一个 no-op 清理。
 * 没有任何同步配置时也会启动——等用户配好之后，下一次改动就会自动生效。
 */
export function startSyncScheduler(): () => void {
  if (stop !== null) return () => undefined;

  const auto = createAutoSync({
    run: async () => {
      if (!isAutoSyncEnabled() || !isSyncConfigured()) return;
      const outcome = await runManualSync();
      // 配置在运行期间被关掉 / 未启用不算失败，不触发退避
      if (!outcome.ok && !isSyncConfigured()) return;
      if (!outcome.ok) throw new Error(outcome.message);
    },
    // 改动后 20 秒合并窗口；两次自动同步至少间隔 1 分钟
    debounceMs: 20_000,
    minIntervalMs: 60_000,
  });
  controller = auto;

  // 启动即尝试一次：新设备第一次打开就能把云上的数据拉下来
  auto.markDirty();

  const unsubscribeStore = appStore.subscribe((state, prev) => {
    // 同步自身会 bootstrapStore() 重建 state，不能把它当成"用户改动"
    if (auto.getStatus().running) return;
    const dataChanged =
      state.tasks !== prev.tasks ||
      state.projects !== prev.projects ||
      state.sections !== prev.sections ||
      state.contexts !== prev.contexts ||
      state.areas !== prev.areas ||
      state.templates !== prev.templates;
    if (dataChanged) auto.markDirty();
  });

  const appStateSub = AppState.addEventListener("change", (next) => {
    if (next === "active") auto.markDirty();
  });

  stop = () => {
    unsubscribeStore();
    appStateSub.remove();
    auto.dispose();
    controller = null;
    stop = null;
  };
  return stop;
}

/** 当前调度器状态（设置页「立即同步」时可用它判断是否已在同步） */
export function getSyncSchedulerStatus(): ReturnType<AutoSyncController["getStatus"]> | null {
  return controller?.getStatus() ?? null;
}

import { appStore, runCommand } from "@gtd/core";

/**
 * 全局错误记录。
 *
 * 背景：v2.5.0 在小米 15 上"新建任务就闪退"，但用户拿不到任何堆栈——
 * RN 生产包把渲染期与未捕获的 JS 异常交给 `ErrorUtils` 的默认 handler，
 * Android 上直接杀进程。没有日志，只能靠猜。
 *
 * 这里做两件事：
 * 1. 覆盖 `ErrorUtils.setGlobalHandler`：记录错误并**不退出**（比闪退好）；
 * 2. 把最近一次错误写进 `kv["crash.last"]`，下次启动可在设置里看到。
 *
 * 只记录 JS 层错误；原生崩溃（NDK / Java）抓不到，需要 `adb logcat`。
 */

export interface CrashEntry {
  at: number;
  source: "js" | "fatal" | "render" | "unknown";
  message: string;
  stack: string;
  componentStack: string;
}

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
}

const MAX_FIELD = 4000;

export async function recordCrash(
  source: CrashEntry["source"],
  error: unknown,
  componentStack = "",
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const entry: CrashEntry = {
    at: Date.now(),
    source,
    message: message.slice(0, MAX_FIELD),
    stack: stack.slice(0, MAX_FIELD),
    componentStack: componentStack.slice(0, MAX_FIELD),
  };

  // 先打到控制台：connect 到设备时 `adb logcat | grep crash` 能看到
  console.error("[crash]", JSON.stringify(entry));

  try {
    const state = appStore.getState();
    if (state.loaded) {
      await runCommand("settings.set", { key: "crash.last", value: JSON.stringify(entry) });
    }
  } catch {
    // 记录失败时绝不能再抛错（否则递归崩溃）
  }
}

export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (errorUtils?.setGlobalHandler === undefined) return;

  errorUtils.setGlobalHandler((error, isFatal) => {
    void recordCrash(isFatal === true ? "fatal" : "js", error);
    // 有意不调用上一个 handler：默认实现会终止进程（= 闪退）。
    // 让 JS 继续跑，用户至少能看到界面并把错误反馈回来。
  });
}

/** 读取最近一次崩溃记录（设置页/诊断用） */
export function readLastCrash(): CrashEntry | null {
  const raw = appStore.getState().kv["crash.last"];
  if (raw === undefined || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as CrashEntry;
  } catch {
    return null;
  }
}

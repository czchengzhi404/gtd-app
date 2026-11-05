/**
 * 自动同步调度器（纯逻辑，无 IO，可测）。
 *
 * 为什么需要它：v2.0 只有「立即同步」按钮——用户换设备后必须记得手动点，
 * 否则会以为数据丢了。这里把「什么时候该同步」收敛成三条规则：
 * ① 本地改动后合并一段窗口再同步（避免每个命令都触发一次网络往返）；
 * ② 两次自动同步之间有最小间隔（防止抖动把网盘打爆）；
 * ③ 失败按次数退避（网络断了不要每秒重试）。
 *
 * 执行本身由调用方注入（`run`），本文件只做"该不该跑"的判断，
 * 所以测试可以完全不碰网络与数据库。
 */

export interface AutoSyncTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface AutoSyncOptions {
  /** 真正的同步动作（抛错即视为失败） */
  run: () => Promise<void>;
  now?: () => number;
  /** 本地改动后的合并窗口，默认 30 秒 */
  debounceMs?: number;
  /** 两次自动同步之间的最小间隔，默认 60 秒 */
  minIntervalMs?: number;
  /** 失败退避基数（按失败次数线性增长），默认 5 分钟 */
  backoffMs?: number;
  /** 退避上限，默认 30 分钟 */
  maxBackoffMs?: number;
  timers?: AutoSyncTimers;
}

export interface AutoSyncStatus {
  running: boolean;
  /** 是否还有未处理的本地改动 */
  pending: boolean;
  lastRunAt: number | null;
  lastError: string | null;
  failures: number;
}

export interface AutoSyncController {
  /** 标记「本地有改动」，触发防抖计时 */
  markDirty: () => void;
  /** 按当前状态决定是否执行一次；返回是否真的跑了 */
  tick: () => Promise<boolean>;
  /** 手动立即执行（忽略防抖与最小间隔，但不会并行） */
  runNow: () => Promise<boolean>;
  getStatus: () => AutoSyncStatus;
  dispose: () => void;
}

const DEFAULT_TIMERS: AutoSyncTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createAutoSync(options: AutoSyncOptions): AutoSyncController {
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? 30_000;
  const minIntervalMs = options.minIntervalMs ?? 60_000;
  const backoffMs = options.backoffMs ?? 5 * 60_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30 * 60_000;
  const timers = options.timers ?? DEFAULT_TIMERS;

  let running = false;
  let dirtySince: number | null = null;
  let lastRunAt: number | null = null;
  let lastError: string | null = null;
  let failures = 0;
  let notBefore = 0;
  let timer: unknown = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (delayMs: number) => {
    if (disposed || timer !== null) return;
    timer = timers.setTimeout(() => {
      timer = null;
      void tick();
    }, Math.max(0, delayMs));
  };

  const execute = async (): Promise<boolean> => {
    if (running || disposed) return false;
    running = true;
    dirtySince = null;
    try {
      await options.run();
      lastRunAt = now();
      failures = 0;
      lastError = null;
      notBefore = 0;
      return true;
    } catch (err) {
      failures += 1;
      lastError = err instanceof Error ? err.message : String(err);
      const backoff = Math.min(maxBackoffMs, backoffMs * failures);
      notBefore = now() + backoff;
      // 失败后保留 pending，并安排好退避结束时的重试（否则没人再叫醒它）
      dirtySince = now();
      schedule(backoff);
      return false;
    } finally {
      running = false;
    }
  };

  const tick = async (): Promise<boolean> => {
    if (disposed || running) return false;
    if (dirtySince === null) return false;
    const at = now();
    const waitDebounce = debounceMs - (at - dirtySince);
    if (waitDebounce > 0) {
      schedule(waitDebounce);
      return false;
    }
    if (at < notBefore) {
      schedule(notBefore - at);
      return false;
    }
    if (lastRunAt !== null && at - lastRunAt < minIntervalMs) {
      schedule(minIntervalMs - (at - lastRunAt));
      return false;
    }
    return execute();
  };

  return {
    markDirty: () => {
      if (disposed) return;
      if (dirtySince === null) dirtySince = now();
      schedule(debounceMs);
    },
    tick,
    runNow: async () => {
      clearTimer();
      return execute();
    },
    getStatus: () => ({ running, pending: dirtySince !== null, lastRunAt, lastError, failures }),
    dispose: () => {
      disposed = true;
      clearTimer();
    },
  };
}

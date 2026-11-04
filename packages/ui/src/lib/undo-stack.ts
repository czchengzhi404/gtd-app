/**
 * 撤销栈（纯函数，可单测）。
 *
 * 背景：v1 的撤销条只保留"最近一次"操作，连续删除/完成三条任务后只能撤销最后一条。
 * v2 引入有界栈：后进先出、最多 10 条、60 秒过期——足够覆盖"手滑连点"场景，
 * 又不会让一个上午前的操作在 Ctrl+Z 时突然复活。
 *
 * 设计约束：
 * - 纯函数：id / 时间戳由调用方注入，测试可完全确定；
 * - 不执行副作用：`run` 只是被存起来，由 UI 层在用户确认时调用；
 * - 过期条目在 pop 时惰性清理，不依赖定时器。
 */

export interface UndoEntry {
  /** 稳定 id（调用方生成，便于去重与调试） */
  id: string;
  /** 展示文案，如「已删除 3 条任务」 */
  message: string;
  /** 按钮文案，默认「撤销」 */
  actionLabel: string;
  /** 回滚动作：重新执行反向命令；允许异步（批量撤销逐条 await） */
  run: () => void | Promise<void>;
  /** 入栈时间（毫秒），用于 TTL 判定 */
  createdAt: number;
}

/** 最多保留的撤销层级 */
export const UNDO_STACK_LIMIT = 10;

/** 条目有效期：超过后 Ctrl+Z 不再触发（避免"很久以前的操作"被意外撤销） */
export const UNDO_TTL_MS = 60_000;

/** 入栈：追加到末尾（最新在末尾），超出上限时丢弃最旧的 */
export function pushUndo(
  stack: readonly UndoEntry[],
  entry: UndoEntry,
  limit: number = UNDO_STACK_LIMIT,
): UndoEntry[] {
  const max = Math.max(1, Math.trunc(limit));
  const next = [...stack, entry];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** 清理过期条目（惰性，pop 前调用） */
export function pruneUndo(
  stack: readonly UndoEntry[],
  now: number,
  ttlMs: number = UNDO_TTL_MS,
): UndoEntry[] {
  return stack.filter((entry) => now - entry.createdAt <= ttlMs);
}

/**
 * 弹出最新一条可撤销操作。
 * 返回 `{ entry: null, rest }` 表示栈空或全部过期——调用方不应报错。
 */
export function popUndo(
  stack: readonly UndoEntry[],
  now: number,
  ttlMs: number = UNDO_TTL_MS,
): { entry: UndoEntry | null; rest: UndoEntry[] } {
  const alive = pruneUndo(stack, now, ttlMs);
  if (alive.length === 0) return { entry: null, rest: [] };
  const entry = alive[alive.length - 1] as UndoEntry;
  return { entry, rest: alive.slice(0, -1) };
}

/** 栈顶（最新的可撤销条目），不弹出 */
export function peekUndo(
  stack: readonly UndoEntry[],
  now: number,
  ttlMs: number = UNDO_TTL_MS,
): UndoEntry | null {
  const alive = pruneUndo(stack, now, ttlMs);
  return alive.length > 0 ? (alive[alive.length - 1] as UndoEntry) : null;
}

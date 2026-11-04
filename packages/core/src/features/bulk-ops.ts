import type { CommandMap, CommandOp } from "../models/commands";
import type { TaskStatusInput } from "../models/task";

/**
 * 批量操作的命令规划层（纯函数，无 IO）。
 *
 * 为什么放 core：批量完成/删除/移动/延后此前写在 mobile 的 hook 里，
 * bun test 够不着，桌面端将来也无法复用。这里只负责"把一批意图展开成
 * 命令序列 + 对应的撤销序列"，执行仍由调用方逐条走 runCommand
 * （每条命令自身是 immediate 事务，批量逐条串行而非长事务——单条失败
 * 不影响已成功的部分）。
 */

export interface CommandEnvelope<K extends CommandOp = CommandOp> {
  op: K;
  payload: CommandMap[K];
}

/** 批量完成的执行计划：正序完成，撤销按原序 uncomplete */
export function planBulkComplete(ids: readonly string[]): {
  run: CommandEnvelope<"task.complete">[];
  undo: CommandEnvelope<"task.uncomplete">[];
} {
  return {
    run: ids.map((id) => ({ op: "task.complete", payload: { id } })),
    undo: ids.map((id) => ({ op: "task.uncomplete", payload: { id } })),
  };
}

/** 批量删除：正序软删，撤销按原序 restore（清墓碑） */
export function planBulkDelete(ids: readonly string[]): {
  run: CommandEnvelope<"task.softDelete">[];
  undo: CommandEnvelope<"task.restore">[];
} {
  return {
    run: ids.map((id) => ({ op: "task.softDelete", payload: { id } })),
    undo: ids.map((id) => ({ op: "task.restore", payload: { id } })),
  };
}

export interface BulkMoveEntry {
  id: string;
  /** 移动前的状态（撤销用） */
  from: TaskStatusInput;
}

/** 批量移动状态：撤销回到各自原状态（不是统一状态） */
export function planBulkMove(
  entries: readonly BulkMoveEntry[],
  to: TaskStatusInput,
): {
  run: CommandEnvelope<"task.moveStatus">[];
  undo: CommandEnvelope<"task.moveStatus">[];
} {
  return {
    run: entries.map((entry) => ({ op: "task.moveStatus", payload: { id: entry.id, status: to } })),
    undo: entries.map((entry) => ({
      op: "task.moveStatus",
      payload: { id: entry.id, status: entry.from },
    })),
  };
}

/** 右滑延后：明天 9:00；撤销回到原 deferUntil */
export function planDeferToTomorrow(
  taskId: string,
  now: number,
  previous: number | null,
): {
  run: CommandEnvelope<"task.update">;
  undo: CommandEnvelope<"task.update">;
  deferredAt: number;
} {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const deferredAt = startOfToday(now) + DAY_MS + 9 * 60 * 60 * 1000;
  return {
    deferredAt,
    run: { op: "task.update", payload: { id: taskId, patch: { deferUntil: deferredAt } } },
    undo: { op: "task.update", payload: { id: taskId, patch: { deferUntil: previous } } },
  };
}

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 批量推迟的预设目标 */
export type DeferPreset = "today" | "tomorrow" | "nextWeek";

/**
 * 预设目标时刻（一律落在 18:00，与快速添加只写日期的默认一致）。
 * nextWeek 取「下周一」，避免把任务推到周末。
 */
export function deferTargetTime(preset: DeferPreset, now: number): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const base = startOfToday(now);
  if (preset === "today") return base + 18 * 60 * 60 * 1000;
  if (preset === "tomorrow") return base + DAY_MS + 18 * 60 * 60 * 1000;
  const weekday = new Date(base).getDay(); // 0=周日
  const daysToNextMonday = weekday === 1 ? 7 : (8 - weekday) % 7;
  return base + daysToNextMonday * DAY_MS + 18 * 60 * 60 * 1000;
}

export interface BulkDeferEntry {
  id: string;
  /** 改期前的到期时间（撤销用；原本没有到期日就是 null） */
  dueAt: number | null;
}

/**
 * 批量推迟到期时间：撤销回到各自的原始 dueAt（不是统一清空）。
 * 不清 deferUntil：用户说的是"改到某天做"，不是"藏起来"。
 */
export function planBulkDefer(
  entries: readonly BulkDeferEntry[],
  dueAt: number,
): {
  run: CommandEnvelope<"task.update">[];
  undo: CommandEnvelope<"task.update">[];
} {
  return {
    run: entries.map((entry) => ({ op: "task.update", payload: { id: entry.id, patch: { dueAt } } })),
    undo: entries.map((entry) => ({
      op: "task.update",
      payload: { id: entry.id, patch: { dueAt: entry.dueAt } },
    })),
  };
}

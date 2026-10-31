import { useCallback, useState } from "react";
import type { Task, TaskStatusInput } from "@gtd/core";
import { runCommand, startOfDay } from "@gtd/core";
import { showUndo, t } from "@gtd/ui";

import { completeTaskWithUndo, deleteTaskWithUndo } from "@/lib/task-ops";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 列表交互：多选、滑动、拖拽排序。
 *
 * 所有写操作都走 core 命令（每条命令自身是 immediate 事务），批量操作
 * 逐条串行执行而不是拼成一个长事务——单条失败不影响已成功的部分，
 * 撤销条一次性回滚整批。
 */
export interface ListInteractions {
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  /** 排序模式：显示拖拽手柄（避免常驻把手占行宽） */
  reorderMode: boolean;
  toggleReorderMode: () => void;
  enterSelection: (task: Task) => void;
  toggleSelect: (task: Task) => void;
  clearSelection: () => void;
  exitSelection: () => void;
  completeSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  moveSelected: (status: TaskStatusInput) => Promise<void>;
  reorder: (ordered: Task[], task: Task, toIndex: number) => Promise<void>;
  swipeLeft: (task: Task) => Promise<void>;
  swipeRight: (task: Task) => Promise<void>;
}

export function useListInteractions(tasks: Task[]): ListInteractions {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);

  const toggleReorderMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setReorderMode((value) => !value);
  }, []);

  const enterSelection = useCallback((task: Task) => {
    setReorderMode(false);
    setSelectionMode(true);
    setSelectedIds(new Set([task.id]));
  }, []);

  const toggleSelect = useCallback((task: Task) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectedTasks = useCallback(
    () => tasks.filter((task) => selectedIds.has(task.id)),
    [tasks, selectedIds],
  );

  const completeSelected = useCallback(async () => {
    const targets = selectedTasks();
    if (targets.length === 0) return;
    exitSelection();
    for (const task of targets) {
      await runCommand("task.complete", { id: task.id }).catch(() => undefined);
    }
    showUndo(t("bulk.completed", { n: targets.length }), () => {
      void (async () => {
        for (const task of targets) {
          await runCommand("task.uncomplete", { id: task.id }).catch(() => undefined);
        }
      })();
    });
  }, [exitSelection, selectedTasks]);

  const deleteSelected = useCallback(async () => {
    const targets = selectedTasks();
    if (targets.length === 0) return;
    exitSelection();
    for (const task of targets) {
      await runCommand("task.softDelete", { id: task.id }).catch(() => undefined);
    }
    showUndo(t("bulk.deleted", { n: targets.length }), () => {
      void (async () => {
        for (const task of targets) {
          await runCommand("task.restore", { id: task.id }).catch(() => undefined);
        }
      })();
    });
  }, [exitSelection, selectedTasks]);

  const moveSelected = useCallback(
    async (status: TaskStatusInput) => {
      const targets = selectedTasks();
      if (targets.length === 0) return;
      const previous = targets.map((task) => ({
        id: task.id,
        status: task.status as TaskStatusInput,
      }));
      exitSelection();
      for (const task of targets) {
        await runCommand("task.moveStatus", { id: task.id, status }).catch(() => undefined);
      }
      showUndo(t("bulk.moved", { n: targets.length }), () => {
        void (async () => {
          for (const entry of previous) {
            await runCommand("task.moveStatus", { id: entry.id, status: entry.status }).catch(
              () => undefined,
            );
          }
        })();
      });
    },
    [exitSelection, selectedTasks],
  );

  const reorder = useCallback(async (ordered: Task[], task: Task, toIndex: number) => {
    const index = ordered.findIndex((entry) => entry.id === task.id);
    if (index < 0 || toIndex < 0 || toIndex >= ordered.length || index === toIndex) return;
    const ids = ordered.map((entry) => entry.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(toIndex, 0, moved);
    await runCommand("task.reorder", { idsInOrder: ids }).catch(() => undefined);
  }, []);

  const swipeLeft = useCallback(async (task: Task) => {
    await completeTaskWithUndo(task);
  }, []);

  /** 右滑延后到明天 9:00（不删除；删除是破坏性操作，只在动作面板里给） */
  const swipeRight = useCallback(async (task: Task) => {
    const previous = task.deferUntil;
    const tomorrow = startOfDay(Date.now() + DAY_MS) + 9 * 60 * 60 * 1000;
    await runCommand("task.update", { id: task.id, patch: { deferUntil: tomorrow } }).catch(
      () => undefined,
    );
    showUndo(t("task.deferredLabel", { date: new Date(tomorrow).toLocaleDateString() }), () => {
      void runCommand("task.update", { id: task.id, patch: { deferUntil: previous } }).catch(
        () => undefined,
      );
    });
  }, []);

  return {
    selectionMode,
    selectedIds,
    reorderMode,
    toggleReorderMode,
    enterSelection,
    toggleSelect,
    clearSelection,
    exitSelection,
    completeSelected,
    deleteSelected,
    moveSelected,
    reorder,
    swipeLeft,
    swipeRight,
  };
}

export { deleteTaskWithUndo };

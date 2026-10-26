import type { ChecklistItem, Task } from "@gtd/core";
import { runCommand } from "@gtd/core";
import { showUndo, t } from "@gtd/ui";
import { gtd } from "@/platform/gtd-api";
import { isDesktop } from "@/platform/env";

/** 完成任务：可撤销（uncomplete） */
export async function completeTaskWithUndo(task: Task): Promise<void> {
  await runCommand("task.complete", { id: task.id }).catch(() => undefined);
  showUndo(t("undo.completed", { title: task.title }), () => {
    void runCommand("task.uncomplete", { id: task.id }).catch(() => undefined);
  });
}

/** 取消完成 */
export async function uncompleteTask(task: Task): Promise<void> {
  await runCommand("task.uncomplete", { id: task.id }).catch(() => undefined);
}

/** 删除任务：软删除 + 可撤销（task.restore 清墓碑） */
export async function deleteTaskWithUndo(task: Task): Promise<void> {
  try {
    await runCommand("task.softDelete", { id: task.id });
    showUndo(t("undo.deleted", { title: task.title }), () => {
      void runCommand("task.restore", { id: task.id }).catch(() => undefined);
    });
  } catch {
    /* 失败时 store.lastError 已记录 */
  }
}

/** 在列表内上移/下移一条任务（写入新的 orderKey 序列） */
export async function moveTask(tasks: Task[], taskId: string, direction: -1 | 1): Promise<void> {
  const index = tasks.findIndex((task) => task.id === taskId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= tasks.length) return;
  const ids = tasks.map((task) => task.id);
  const [moved] = ids.splice(index, 1);
  if (moved === undefined) return;
  ids.splice(target, 0, moved);
  await runCommand("task.reorder", { idsInOrder: ids }).catch(() => undefined);
}

/* ---------------- 清单子项 ---------------- */

function newChecklistId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function addChecklistItem(task: Task, title: string): Promise<void> {
  const items: ChecklistItem[] = [
    ...task.checklist,
    {
      id: newChecklistId(),
      title,
      done: false,
      orderKey: String(task.checklist.length).padStart(4, "0"),
    },
  ];
  await updateChecklist(task, items);
}

export async function toggleChecklistItem(task: Task, itemId: string): Promise<void> {
  const items = task.checklist.map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item,
  );
  await updateChecklist(task, items);
}

export async function removeChecklistItem(task: Task, itemId: string): Promise<void> {
  const items = task.checklist.filter((item) => item.id !== itemId);
  await updateChecklist(task, items);
}

/** 清单是记录内嵌数据：整体替换，随记录一起参与同步合并 */
async function updateChecklist(task: Task, items: ChecklistItem[]): Promise<void> {
  await runCommand("task.update", { id: task.id, patch: { checklist: items } }).catch(
    () => undefined,
  );
}

/* ---------------- 附件（仅桌面端可选取文件） ---------------- */

export async function addAttachmentFromDialog(task: Task): Promise<boolean> {
  if (!isDesktop()) return false;
  const picked = await gtd().dialog.open();
  if (picked === null) return false;
  const fileName = picked.split(/[\\/]/).pop() ?? picked;
  await runCommand("attachment.add", {
    taskId: task.id,
    fileName,
    storagePath: picked,
  }).catch(() => undefined);
  return true;
}

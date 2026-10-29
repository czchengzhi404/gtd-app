import { Platform } from "react-native";
import type { Task, TaskStatusInput } from "@gtd/core";
import { runCommand } from "@gtd/core";
import { t } from "@gtd/ui";
import { gtd, hasDesktopBridge } from "@/platform/gtd-api";
import { completeTaskWithUndo, deleteTaskWithUndo } from "@/lib/task-ops";

/**
 * 桌面端原生右键菜单：仅在 Electron 渲染进程中生效。
 * 返回 true 表示已由原生菜单处理（调用方应阻止默认行为）。
 *
 * 菜单项由渲染端构造（知道任务当前状态），主进程负责 popup 与回传 id。
 */
const STATUS_ITEMS: { id: string; status: TaskStatusInput; labelKey: string }[] = [
  { id: "status:inbox", status: "inbox", labelKey: "detail.status.inbox" },
  { id: "status:next", status: "next", labelKey: "detail.status.next" },
  { id: "status:waiting", status: "waiting", labelKey: "detail.status.waiting" },
  { id: "status:someday", status: "someday", labelKey: "detail.status.someday" },
];

export async function openTaskContextMenu(
  task: Task,
  position?: { x: number; y: number },
): Promise<boolean> {
  if (Platform.OS !== "web" || !hasDesktopBridge()) return false;

  const items: { id: string; label: string; enabled?: boolean; type?: "separator" }[] = [
    { id: "open", label: t("task.ctxOpen") },
    { id: "separator-1", label: "", type: "separator" },
    ...STATUS_ITEMS.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      enabled: task.status !== item.status,
    })),
    { id: "separator-2", label: "", type: "separator" },
    { id: "star", label: task.starred ? t("task.ctxUnstar") : t("task.ctxStar") },
    { id: "complete", label: t("task.ctxComplete"), enabled: task.status !== "done" },
    { id: "delete", label: t("task.ctxDelete") },
  ];

  const picked = await gtd()
    .menu.context(items, position)
    .catch(() => null);
  if (picked === null) return true;

  const statusItem = STATUS_ITEMS.find((item) => item.id === picked);
  if (statusItem !== undefined) {
    await runCommand("task.moveStatus", { id: task.id, status: statusItem.status }).catch(
      () => undefined,
    );
    return true;
  }

  switch (picked) {
    case "open":
      return false; // 交由调用方打开详情
    case "star":
      await runCommand("task.update", {
        id: task.id,
        patch: { starred: !task.starred },
      }).catch(() => undefined);
      break;
    case "complete":
      await completeTaskWithUndo(task);
      break;
    case "delete":
      await deleteTaskWithUndo(task);
      break;
    default:
      break;
  }
  return true;
}

/** 桌面端右键菜单是否可用（用于决定是否挂 contextmenu 监听） */
export function supportsContextMenu(): boolean {
  return Platform.OS === "web" && hasDesktopBridge();
}

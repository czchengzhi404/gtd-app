import type { Task, Project } from "@gtd/core";
import { runCommand } from "@gtd/core";
import { t, showPrompt, showConfirm } from "@gtd/ui";
import { moveTask, deleteTaskWithUndo } from "@/lib/task-ops";

/**
 * 列表行操作接线：重命名 / 排序 / 删除。
 * 重命名用跨端 PromptHost（window.prompt 在 RN 原生不存在），
 * 删除走软删除 + 撤销条。
 */

export type TaskRowAction = {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (task: Task) => void;
};

export function useTaskActions(): TaskRowAction[] {
  return [
    {
      key: "rename",
      label: t("task.actionRename"),
      onSelect: (task) => void renameTask(task),
    },
    {
      key: "delete",
      label: t("task.actionDelete"),
      danger: true,
      onSelect: (task) => void deleteTaskWithUndo(task),
    },
  ];
}

/** 带排序能力的行操作：需要当前列表顺序 */
export function useOrderedTaskActions(tasks: Task[]): TaskRowAction[] {
  const base = useTaskActions();
  return [
    base[0] as TaskRowAction,
    {
      key: "up",
      label: t("task.moveUp"),
      onSelect: (task) => void moveTask(tasks, task.id, -1),
    },
    {
      key: "down",
      label: t("task.moveDown"),
      onSelect: (task) => void moveTask(tasks, task.id, 1),
    },
    base[1] as TaskRowAction,
  ];
}

async function renameTask(task: Task): Promise<void> {
  // eslint-disable-next-line no-alert -- Android/RNW 无 Alert.prompt，用浏览器原生 prompt 回退
  const input = typeof window !== "undefined" ? window.prompt(t("task.renameTitle"), task.title) : null;
  if (input === null) return;
  const title = input.trim();
  if (title.length === 0 || title === task.title) return;
  await runCommand("task.update", { id: task.id, patch: { title } }).catch(() => undefined);
}


export function useProjectActions(): {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (project: Project) => void;
}[] {
  return [
    {
      key: "rename",
      label: t("projects.renameTitle"),
      onSelect: (project) => void renameProject(project),
    },
    {
      key: "toggleKind",
      label: t("projects.kindPrompt"),
      onSelect: (project) => void toggleProjectKind(project),
    },
    {
      key: "delete",
      label: t("projects.deleteConfirm"),
      danger: true,
      onSelect: (project) => confirmDeleteProject(project),
    },
  ];
}

async function renameProject(project: Project): Promise<void> {
  const input = await showPrompt({ title: t("projects.renameTitle"), initialValue: project.name });
  if (input === null) return;
  const name = input.trim();
  if (name.length === 0 || name === project.name) return;
  await runCommand("project.upsert", {
    id: project.id,
    name,
    kind: project.kind,
    status: project.status,
  }).catch(() => undefined);
}

async function toggleProjectKind(project: Project): Promise<void> {
  const kind = project.kind === "sequential" ? "parallel" : "sequential";
  await runCommand("project.upsert", {
    id: project.id,
    name: project.name,
    kind,
    status: project.status,
  }).catch(() => undefined);
}

async function confirmDeleteProject(project: Project): Promise<void> {
  const ok = await showConfirm({
    title: t("projects.deleteConfirm"),
    message: t("projects.deleteConfirmBody", { name: project.name }),
    confirmLabel: t("common.delete"),
  });
  if (!ok) return;
  // 先解绑项目内任务的 projectId，再删项目（任务保留）
  const { appStore, runCommand: run } = await import("@gtd/core");
  const tasks = Object.values(appStore.getState().tasks).filter(
    (task) => task.projectId === project.id && task.deletedAt === null,
  );
  for (const task of tasks) {
    await run("task.update", { id: task.id, patch: { projectId: null } }).catch(() => undefined);
  }
  await run("project.softDelete", { id: project.id }).catch(() => undefined);
}

import { Alert } from "react-native";
import type { Task, Project } from "@gtd/core";
import { runCommand } from "@gtd/core";
import { t } from "@gtd/ui";

/**
 * 列表行操作接线：删除（确认对话框）+ 重命名（RN Alert.prompt iOS / 手动弹窗）。
 * Alert.prompt 仅 iOS 原生可用；Android/web 走简单的 prompt 回退。
 */

export function useTaskActions(): {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (task: Task) => void;
}[] {
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
      onSelect: (task) => confirmDeleteTask(task),
    },
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

function confirmDeleteTask(task: Task): void {
  Alert.alert(t("detail.deleteConfirm"), t("detail.deleteConfirmBody", { title: task.title }), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("common.delete"),
      style: "destructive",
      onPress: () => {
        void runCommand("task.softDelete", { id: task.id }).catch(() => undefined);
      },
    },
  ]);
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
  // eslint-disable-next-line no-alert
  const input = typeof window !== "undefined" ? window.prompt(t("projects.renameTitle"), project.name) : null;
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

function confirmDeleteProject(project: Project): void {
  Alert.alert(
    t("projects.deleteConfirm"),
    t("projects.deleteConfirmBody", { name: project.name }),
    [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          // 先解绑项目内任务的 projectId，再删项目（任务保留）
          void (async () => {
            const { appStore, runCommand: run } = await import("@gtd/core");
            const tasks = Object.values(appStore.getState().tasks).filter(
              (task) => task.projectId === project.id && task.deletedAt === null,
            );
            for (const task of tasks) {
              await run("task.update", { id: task.id, patch: { projectId: null } }).catch(
                () => undefined,
              );
            }
            await run("project.softDelete", { id: project.id }).catch(() => undefined);
          })();
        },
      },
    ],
  );
}

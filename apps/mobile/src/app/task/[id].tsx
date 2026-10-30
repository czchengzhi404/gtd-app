import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { View } from "react-native";

import { Screen, TaskDetailContent, showConfirm, useAppStore, useT } from "@gtd/ui";
import {
  getAllTags,
  getAttachmentsForTask,
  getSqliteExecutor,
  selectActiveProjects,
  selectContexts,
  selectTaskById,
  runCommand,
} from "@gtd/core";
import type { AttachmentMeta, TaskStatusInput } from "@gtd/core";
import {
  addAttachmentFromDialog,
  addAttachmentFromPicker,
  addChecklistItem,
  deleteTaskWithUndo,
  removeChecklistItem,
  toggleChecklistItem,
} from "@/lib/task-ops";
import { isDesktop } from "@/platform/env";

/** 任务详情：状态流转、优先级、标签、专注、清单子项、附件、删除（可撤销） */
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = typeof id === "string" ? id : "";
  const task = useAppStore((s) => selectTaskById(s, taskId));
  const contexts = useAppStore(selectContexts);
  const projects = useAppStore(selectActiveProjects);
  const tagSuggestions = useAppStore(getAllTags);
  const t = useT();
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  const reloadAttachments = async (targetId: string) => {
    const list = await getAttachmentsForTask(getSqliteExecutor(), targetId).catch(() => []);
    setAttachments(list);
  };

  useEffect(() => {
    if (taskId.length === 0) return;
    void reloadAttachments(taskId);
  }, [taskId, task?.revision]);

  if (task === null) return <Screen>{null}</Screen>;

  const contextNames = task.contextIds
    .map((cid) => contexts.find((c) => c.id === cid)?.name)
    .filter((n): n is string => n !== undefined);
  const projectName = projects.find((p) => p.id === task.projectId)?.name;

  const confirmDelete = async () => {
    const ok = await showConfirm({
      title: t("detail.deleteConfirm"),
      message: t("detail.deleteConfirmBody", { title: task.title }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    await deleteTaskWithUndo(task);
    if (router.canGoBack()) router.back();
  };

  const pickAttachment = async () => {
    if (isDesktop()) {
      await addAttachmentFromDialog(task);
    } else {
      await addAttachmentFromPicker(task);
    }
    await reloadAttachments(task.id);
  };

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <TaskDetailContent
          task={task}
          now={Date.now()}
          projectName={projectName}
          contextNames={contextNames}
          tagSuggestions={tagSuggestions}
          onMoveStatus={(status: TaskStatusInput) =>
            void runCommand("task.moveStatus", { id: task.id, status }).catch(() => undefined)
          }
          onToggleStar={() =>
            void runCommand("task.update", {
              id: task.id,
              patch: { starred: !task.starred },
            }).catch(() => undefined)
          }
          onSetPriority={(priority) =>
            void runCommand("task.update", { id: task.id, patch: { priority } }).catch(() => undefined)
          }
          onSetDefer={(until) =>
            void runCommand("task.update", { id: task.id, patch: { deferUntil: until } }).catch(
              () => undefined,
            )
          }
          onSetTags={(tags) =>
            void runCommand("task.update", { id: task.id, patch: { tags } }).catch(() => undefined)
          }
          onDelete={() => void confirmDelete()}
          onToggleChecklist={(itemId) => void toggleChecklistItem(task, itemId)}
          onAddChecklist={(title) => void addChecklistItem(task, title)}
          onRemoveChecklist={(itemId) => void removeChecklistItem(task, itemId)}
          attachments={attachments}
          onAddAttachment={() => void pickAttachment()}
          onRemoveAttachment={(attachmentId) =>
            void runCommand("attachment.remove", { id: attachmentId })
              .then(() => reloadAttachments(task.id))
              .catch(() => undefined)
          }
        />
      </View>
    </Screen>
  );
}

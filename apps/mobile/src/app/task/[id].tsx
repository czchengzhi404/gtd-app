import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Alert, View } from "react-native";

import { Screen, TaskDetailContent, useAppStore, useT } from "@gtd/ui";
import {
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
  addChecklistItem,
  deleteTaskWithUndo,
  removeChecklistItem,
  toggleChecklistItem,
} from "@/lib/task-ops";
import { isDesktop } from "@/platform/env";

/** 任务详情：状态流转、优先级、专注、清单子项、附件、删除（可撤销） */
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = typeof id === "string" ? id : "";
  const task = useAppStore((s) => selectTaskById(s, taskId));
  const contexts = useAppStore(selectContexts);
  const projects = useAppStore(selectActiveProjects);
  const t = useT();
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  useEffect(() => {
    if (taskId.length === 0) return;
    void (async () => {
      const list = await getAttachmentsForTask(getSqliteExecutor(), taskId).catch(() => []);
      setAttachments(list);
    })();
  }, [taskId, task?.revision]);

  if (task === null) return <Screen>{null}</Screen>;

  const contextNames = task.contextIds
    .map((cid) => contexts.find((c) => c.id === cid)?.name)
    .filter((n): n is string => n !== undefined);
  const projectName = projects.find((p) => p.id === task.projectId)?.name;

  const confirmDelete = () => {
    Alert.alert(t("detail.deleteConfirm"), t("detail.deleteConfirmBody", { title: task.title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void deleteTaskWithUndo(task).then(() => {
            if (router.canGoBack()) router.back();
          });
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <TaskDetailContent
          task={task}
          now={Date.now()}
          projectName={projectName}
          contextNames={contextNames}
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
          onDelete={confirmDelete}
          onToggleChecklist={(itemId) => void toggleChecklistItem(task, itemId)}
          onAddChecklist={(title) => void addChecklistItem(task, title)}
          onRemoveChecklist={(itemId) => void removeChecklistItem(task, itemId)}
          attachments={attachments}
          onAddAttachment={
            isDesktop()
              ? () =>
                  void addAttachmentFromDialog(task).then(async () => {
                    setAttachments(await getAttachmentsForTask(getSqliteExecutor(), task.id));
                  })
              : undefined
          }
          onRemoveAttachment={(attachmentId) =>
            void runCommand("attachment.remove", { id: attachmentId })
              .then(async () => {
                setAttachments(await getAttachmentsForTask(getSqliteExecutor(), task.id));
              })
              .catch(() => undefined)
          }
        />
      </View>
    </Screen>
  );
}

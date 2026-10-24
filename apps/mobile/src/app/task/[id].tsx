import { useLocalSearchParams, router } from "expo-router";
import { Alert, View } from "react-native";

import { Screen, TaskDetailContent, useAppStore, useT } from "@gtd/ui";
import { selectContexts, selectActiveProjects, selectTaskById, runCommand } from "@gtd/core";
import type { TaskStatusInput } from "@gtd/core";

/** 任务详情（理清/组织的主场所）：状态流转、优先级、专注、删除 */
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = typeof id === "string" ? id : "";
  const task = useAppStore((s) => selectTaskById(s, taskId));
  const contexts = useAppStore(selectContexts);
  const projects = useAppStore(selectActiveProjects);
  const t = useT();

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
          void runCommand("task.softDelete", { id: task.id })
            .then(() => {
              if (router.canGoBack()) router.back();
            })
            .catch(() => undefined);
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
        />
      </View>
    </Screen>
  );
}

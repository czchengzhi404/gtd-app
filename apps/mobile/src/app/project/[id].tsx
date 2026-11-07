import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Chip, KanbanBoard, ProjectDetailContent, Screen, space, useAppStore, useT } from "@gtd/ui";
import { appStore, getProjectNextAction, runCommand, selectAreas } from "@gtd/core";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";
import type { KanbanColumn } from "@gtd/ui";

/** 项目详情：进度、所属区域、按 section 分组的任务、下一步行动高亮 */
export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = typeof id === "string" ? id : "";
  const project = useAppStore((s) => s.projects[projectId]);
  const allTasks = useAppStore((s) => s.tasks);
  const allSections = useAppStore((s) => s.sections);
  const areas = useAppStore(selectAreas);
  const t = useT();
  const [view, setView] = useState<"list" | "kanban">("list");

  if (project === undefined || project.deletedAt !== null) {
    return (
      <Screen>
        <View style={{ flex: 1 }} />
      </Screen>
    );
  }

  const projectTasks = Object.values(allTasks)
    .filter((task) => task.deletedAt === null && task.projectId === projectId)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
  const projectSections = Object.values(allSections)
    .filter((section) => section.deletedAt === null && section.projectId === projectId)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
  const nextAction = getProjectNextAction(appStore.getState(), projectId);

  /**
   * 看板列按状态切分（项目内任务通常是 next，但收集/等待/将来也许也会出现）。
   * 拖到另一列 = 执行 task.moveStatus，和列表里的「理清」是同一个命令。
   */
  const kanbanColumns: KanbanColumn[] =
    view === "kanban"
      ? (
          [
            { key: "inbox", title: t("detail.status.inbox"), status: "inbox" },
            { key: "next", title: t("detail.status.next"), status: "next" },
            { key: "waiting", title: t("detail.status.waiting"), status: "waiting" },
            { key: "someday", title: t("detail.status.someday"), status: "someday" },
            { key: "done", title: t("kanban.done"), status: null },
          ] as const
        ).map((column) => ({
          key: column.key,
          title: column.title,
          status: column.status,
          tasks: projectTasks.filter((task) => task.status === column.status),
        }))
      : [];

  return (
    <Screen>
      <View style={styles.viewSwitch}>
        <Chip label={t("kanban.viewList")} selected={view === "list"} onPress={() => setView("list")} />
        <Chip label={t("kanban.viewBoard")} selected={view === "kanban"} onPress={() => setView("kanban")} />
      </View>
      {view === "kanban" ? (
        <KanbanBoard
          columns={kanbanColumns}
          now={Date.now()}
          onPressTask={(task) => router.push(`/task/${task.id}`)}
          onMoveTask={(task, status) =>
            void runCommand("task.moveStatus", { id: task.id, status }).catch(() => undefined)
          }
        />
      ) : (
      <ProjectDetailContent
        project={project}
        sections={projectSections}
        tasks={projectTasks}
        nextActionId={nextAction?.id ?? null}
        now={Date.now()}
        onToggleTask={(task) =>
          void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
        }
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        areas={areas}
        onSetArea={(areaId) =>
          void runCommand("project.upsert", {
            id: project.id,
            name: project.name,
            areaId,
          }).catch(() => undefined)
        }
      />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewSwitch: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
});

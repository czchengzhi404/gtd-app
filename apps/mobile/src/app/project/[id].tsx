import { useLocalSearchParams, router } from "expo-router";
import { View } from "react-native";

import { ProjectDetailContent, Screen, useAppStore } from "@gtd/ui";
import { appStore, getProjectNextAction } from "@gtd/core";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";

/** 项目详情：进度、按 section 分组的任务、下一步行动高亮 */
export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = typeof id === "string" ? id : "";
  const project = useAppStore((s) => s.projects[projectId]);
  const allTasks = useAppStore((s) => s.tasks);
  const allSections = useAppStore((s) => s.sections);

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

  return (
    <Screen>
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
      />
    </Screen>
  );
}

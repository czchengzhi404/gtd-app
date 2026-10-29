import { useMemo } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import { Pomodoro, SectionHeader, TaskList, useAppStore, useT } from "@gtd/ui";
import { getTodayTasks, selectContexts } from "@gtd/core";
import { useTaskActions } from "@/hooks/useRowActions";
import { openTaskContextMenu } from "@/lib/context-menu";
import { completeTaskWithUndo } from "@/lib/task-ops";

/** 专注：番茄钟 + 已选中的下一步行动 + 今日到期 */
export default function FocusScreen() {
  const allTasks = useAppStore((s) => Object.values(s.tasks));
  const todayTasks = useAppStore((s) => getTodayTasks(s, Date.now()));
  const contexts = useAppStore(selectContexts);
  const loaded = useAppStore((s) => s.loaded);
  const t = useT();
  const actions = useTaskActions();

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contexts) map[c.id] = c.name;
    return map;
  }, [contexts]);

  if (!loaded) return null;

  const starred = allTasks
    .filter((task) => task.starred && task.status !== "done")
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));

  return (
    <View style={{ flex: 1 }}>
      <Pomodoro />
      <SectionHeader title={t("focus.starredSection")} />
      <TaskList
        tasks={starred}
        now={Date.now()}
        contextNameById={contextNameById}
        actions={actions}
        onContextMenuTask={(task, position) => openTaskContextMenu(task, position)}
        onToggleTask={(task) => void completeTaskWithUndo(task)}
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        emptyTitle={t("focus.emptyStarred")}
        emptyHint={t("focus.emptyStarredHint")}
      />
      <SectionHeader title={t("focus.todaySection")} />
      <TaskList
        tasks={todayTasks}
        now={Date.now()}
        contextNameById={contextNameById}
        actions={actions}
        onContextMenuTask={(task, position) => openTaskContextMenu(task, position)}
        onToggleTask={(task) => void completeTaskWithUndo(task)}
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        emptyTitle={t("focus.emptyToday")}
      />
    </View>
  );
}

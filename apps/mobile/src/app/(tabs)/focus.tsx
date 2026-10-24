import { useMemo } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { SectionHeader, TaskList, useAppStore, useTheme, useT } from "@gtd/ui";
import { selectContexts, getTodayTasks, runCommand } from "@gtd/core";

/** 专注：只展示当下能做的事——已选中的下一步行动（starred）+ 今日到期，分区展示 */
export default function FocusScreen() {
  const allTasks = useAppStore((s) => Object.values(s.tasks));
  const todayTasks = useAppStore((s) => getTodayTasks(s, Date.now()));
  const contexts = useAppStore(selectContexts);
  const loaded = useAppStore((s) => s.loaded);
  const colors = useTheme();
  const t = useT();

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
      <SectionHeader
        title={t("focus.starredSection")}
        trailing={<Text style={{ color: colors.textSecondary }}>{starred.length}</Text>}
      />
      <TaskList
        tasks={starred}
        now={Date.now()}
        contextNameById={contextNameById}
        onToggleTask={(task) => void runCommand("task.complete", { id: task.id }).catch(() => undefined)}
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        emptyTitle={t("focus.emptyStarred")}
        emptyHint={t("focus.emptyStarredHint")}
      />
      <SectionHeader
        title={t("focus.todaySection")}
        trailing={<Text style={{ color: colors.textSecondary }}>{todayTasks.length}</Text>}
      />
      <TaskList
        tasks={todayTasks}
        now={Date.now()}
        contextNameById={contextNameById}
        onToggleTask={(task) =>
          void runCommand(
            task.status === "done" ? "task.uncomplete" : "task.complete",
            { id: task.id },
          ).catch(() => undefined)
        }
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        emptyTitle={t("focus.emptyToday")}
      />
    </View>
  );
}

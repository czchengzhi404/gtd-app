import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  CalendarView,
  SectionHeader,
  TaskList,
  TimelineView,
  ViewToggle,
  useAppStore,
  useBreakpoint,
  useT,
} from "@gtd/ui";
import { selectContexts, getTodayTasks, runCommand } from "@gtd/core";
import { useTaskActions } from "@/hooks/useRowActions";

type TodayView = "list" | "calendar" | "timeline";

/** 今天：今日到期 + 逾期。列表 / 日历 / Timeline（≥1440）三视图 */
export default function TodayScreen() {
  const tasks = useAppStore((s) => getTodayTasks(s, Date.now()));
  const allTasks = useAppStore((s) => Object.values(s.tasks));
  const contexts = useAppStore(selectContexts);
  const loaded = useAppStore((s) => s.loaded);
  const { isWideUp } = useBreakpoint();
  const t = useT();
  const taskActions = useTaskActions();
  const [view, setView] = useState<TodayView>("list");

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contexts) map[c.id] = c.name;
    return map;
  }, [contexts]);

  if (!loaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <ViewToggle<TodayView>
        label={t("view.todayLabel")}
        value={view}
        onChange={setView}
        options={[
          { key: "list", label: t("view.list") },
          { key: "calendar", label: t("view.calendar") },
          { key: "timeline", label: t("view.timeline"), disabled: !isWideUp },
        ]}
      />

      {view === "list" ? (
        <TaskList
          tasks={tasks}
          now={Date.now()}
          contextNameById={contextNameById}
          actions={taskActions}
          onToggleTask={(task) =>
            void runCommand(
              task.status === "done" ? "task.uncomplete" : "task.complete",
              { id: task.id },
            ).catch(() => undefined)
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
          emptyTitle={t("today.emptyTitle")}
          emptyHint={t("today.emptyHint")}
        />
      ) : view === "calendar" ? (
        <CalendarView
          tasks={allTasks}
          now={Date.now()}
          onPressTask={(task) => router.push(`/task/${task.id}`)}
        />
      ) : (
        <TimelineView tasks={allTasks} now={Date.now()} />
      )}
    </View>
  );
}

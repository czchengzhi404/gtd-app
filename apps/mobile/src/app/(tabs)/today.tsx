import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  CalendarView,
  FilterBar,
  TaskList,
  TimelineView,
  ViewToggle,
  useAppStore,
  useBreakpoint,
  useT,
} from "@gtd/ui";
import { applyListFilter, getTodayTasks, selectContexts } from "@gtd/core";
import { useOrderedTaskActions } from "@/hooks/useRowActions";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";

type TodayView = "list" | "calendar" | "timeline";

/** 今天：今日到期 + 逾期；列表 / 日历 / Timeline（≥1440） */
export default function TodayScreen() {
  const tasks = useAppStore((s) => getTodayTasks(s, Date.now()));
  const allTasks = useAppStore((s) => Object.values(s.tasks));
  const contexts = useAppStore(selectContexts);
  const loaded = useAppStore((s) => s.loaded);
  const { isWideUp } = useBreakpoint();
  const t = useT();

  const [view, setView] = useState<TodayView>("list");
  const [query, setQuery] = useState("");
  const [contextId, setContextId] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filtered = useMemo(
    () => applyListFilter(tasks, { query, contextId, overdueOnly }, Date.now()),
    [tasks, query, contextId, overdueOnly],
  );
  const actions = useOrderedTaskActions(filtered);

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contexts) map[c.id] = c.name;
    return map;
  }, [contexts]);

  if (!loaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        contexts={contexts.map((c) => ({ id: c.id, name: c.name }))}
        contextId={contextId}
        onContextChange={setContextId}
        overdueOnly={overdueOnly}
        onOverdueChange={setOverdueOnly}
        resultCount={filtered.length}
      />
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
          tasks={filtered}
          now={Date.now()}
          contextNameById={contextNameById}
          actions={actions}
          onToggleTask={(task) =>
            void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
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

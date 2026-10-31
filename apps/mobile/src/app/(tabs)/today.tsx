import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  BulkActionBar,
  CalendarView,
  EmptyState,
  FilterBar,
  IconButton,
  OptionSheet,
  showUndo,
  TaskList,
  TimelineView,
  UpcomingView,
  ViewToggle,
  useAppStore,
  useBreakpoint,
  useT,
} from "@gtd/ui";
import {
  applyListFilter,
  getAllTags,
  getInboxTasks,
  getTodayTasks,
  getUpcomingGroups,
  runCommand,
  selectContexts,
  startOfDay,
} from "@gtd/core";
import type { TaskStatusInput } from "@gtd/core";
import { useOrderedTaskActions } from "@/hooks/useRowActions";
import { useListInteractions } from "@/hooks/useListInteractions";
import { openTaskContextMenu } from "@/lib/context-menu";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";

type TodayView = "list" | "upcoming" | "calendar" | "timeline";

const MOVE_OPTIONS = [
  { key: "next", labelKey: "detail.status.next" },
  { key: "waiting", labelKey: "detail.status.waiting" },
  { key: "someday", labelKey: "detail.status.someday" },
  { key: "inbox", labelKey: "detail.status.inbox" },
] as const;

/** 今天：今日到期 + 逾期；列表 / 日历 / Timeline（≥1440） */
export default function TodayScreen() {
  const tasks = useAppStore((s) => getTodayTasks(s, Date.now()));
  const upcomingGroups = useAppStore((s) => getUpcomingGroups(s, Date.now()));
  const allTasks = useAppStore((s) => Object.values(s.tasks));
  const inboxTasks = useAppStore(getInboxTasks);
  const contexts = useAppStore(selectContexts);
  const allTags = useAppStore(getAllTags);
  const loaded = useAppStore((s) => s.loaded);
  const { isWideUp, isTabletUp } = useBreakpoint();
  const t = useT();

  const [view, setView] = useState<TodayView>("list");
  const [query, setQuery] = useState("");
  const [contextId, setContextId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [pickSheetOpen, setPickSheetOpen] = useState(false);

  const filtered = useMemo(
    () => applyListFilter(tasks, { query, contextId, tag, overdueOnly }, Date.now()),
    [tasks, query, contextId, tag, overdueOnly],
  );
  const actions = useOrderedTaskActions(filtered);
  const interactions = useListInteractions(filtered);

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contexts) map[c.id] = c.name;
    return map;
  }, [contexts]);

  if (!loaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <FilterBar
        compact={isTabletUp}
        query={query}
        onQueryChange={setQuery}
        contexts={contexts.map((c) => ({ id: c.id, name: c.name }))}
        contextId={contextId}
        onContextChange={setContextId}
        overdueOnly={overdueOnly}
        onOverdueChange={setOverdueOnly}
        resultCount={filtered.length}
        tags={allTags}
        tag={tag}
        onTagChange={setTag}
      />
      <ViewToggle<TodayView>
        label={t("view.todayLabel")}
        value={view}
        onChange={setView}
        options={[
          { key: "list", label: t("view.list") },
          { key: "upcoming", label: t("view.upcoming") },
          { key: "calendar", label: t("view.calendar") },
          { key: "timeline", label: t("view.timeline"), disabled: !isWideUp },
        ]}
        trailing={
          view === "list" ? (
            <IconButton
              icon="swap-vertical"
              filled={interactions.reorderMode}
              onPress={interactions.toggleReorderMode}
              accessibilityLabel={t("task.dragHandle")}
            />
          ) : null
        }
      />

      {view === "list" ? (
        <TaskList
          tasks={filtered}
          now={Date.now()}
          contextNameById={contextNameById}
          actions={interactions.selectionMode || interactions.reorderMode ? undefined : actions}
          onContextMenuTask={(task, position) => openTaskContextMenu(task, position)}
          onToggleTask={(task) =>
            void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
          emptyTitle={t("today.emptyTitle")}
          emptyHint={t("today.emptyHint")}
          emptyIllustration="today"
          emptyAction={
            inboxTasks.length > 0
              ? {
                  label: t("today.pick"),
                  icon: "file-tray-outline",
                  onPress: () => setPickSheetOpen(true),
                }
              : undefined
          }
          selectionMode={interactions.selectionMode}
          selectedIds={interactions.selectedIds}
          onToggleSelect={interactions.toggleSelect}
          onEnterSelection={interactions.enterSelection}
          onSwipeLeftTask={(task) => void interactions.swipeLeft(task)}
          onSwipeRightTask={(task) => void interactions.swipeRight(task)}
          onReorderTask={(task, toIndex) => void interactions.reorder(filtered, task, toIndex)}
          reorderMode={interactions.reorderMode}
        />
      ) : view === "upcoming" ? (
        <UpcomingView
          groups={upcomingGroups}
          now={Date.now()}
          onToggleTask={(task) =>
            void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
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

      {interactions.selectionMode ? (
        <BulkActionBar
          count={interactions.selectedIds.size}
          onComplete={() => void interactions.completeSelected()}
          onDelete={() => void interactions.deleteSelected()}
          onMove={() => setMoveSheetOpen(true)}
          onClear={interactions.clearSelection}
          onExit={interactions.exitSelection}
        />
      ) : null}

      <OptionSheet
        visible={moveSheetOpen}
        title={t("bulk.moveTo")}
        options={MOVE_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
        onSelect={(key) => {
          setMoveSheetOpen(false);
          void interactions.moveSelected(key as TaskStatusInput);
        }}
        onClose={() => setMoveSheetOpen(false)}
      />

      <OptionSheet
        visible={pickSheetOpen}
        title={t("today.pickTitle")}
        options={inboxTasks.slice(0, 10).map((task) => ({
          key: task.id,
          label: task.title,
        }))}
        onSelect={(taskId) => {
          setPickSheetOpen(false);
          const task = inboxTasks.find((candidate) => candidate.id === taskId);
          if (task === undefined) return;
          const dueAt = startOfDay(Date.now()) + 18 * 60 * 60 * 1000;
          void runCommand("task.update", { id: task.id, patch: { dueAt } }).catch(() => undefined);
          showUndo(t("today.picked", { title: task.title }), () => {
            void runCommand("task.update", { id: task.id, patch: { dueAt: null } }).catch(
              () => undefined,
            );
          });
        }}
        onClose={() => setPickSheetOpen(false)}
      />
    </View>
  );
}

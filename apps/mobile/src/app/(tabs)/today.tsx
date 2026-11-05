import { useMemo, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Badge,
  BulkActionBar,
  CalendarView,
  EmptyState,
  FilterBar,
  getLang,
  IconButton,
  OptionSheet,
  PageHeader,
  showUndo,
  TaskList,
  TimelineView,
  UpcomingView,
  ViewToggle,
  space,
  useAppStore,
  useBreakpoint,
  useNowMinute,
  useTheme,
  useT,
} from "@gtd/ui";
import {
  applyListFilter,
  getAllTags,
  getInboxTasks,
  getAllTasks,
  getTodayTasks,
  getUpcomingGroups,
  runCommand,
  selectContexts,
  startOfDay,
} from "@gtd/core";
import type { DeferPreset, TaskStatusInput } from "@gtd/core";
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

const DEFER_OPTIONS = [
  { key: "today", labelKey: "bulk.deferToday" },
  { key: "tomorrow", labelKey: "bulk.deferTomorrow" },
  { key: "nextWeek", labelKey: "bulk.deferNextWeek" },
] as const;

/** 今天：今日到期 + 逾期；列表 / 日历 / Timeline（≥1440） */
export default function TodayScreen() {
  const nowMinute = useNowMinute();
  const tasks = useAppStore((s) => getTodayTasks(s, nowMinute));
  const upcomingGroups = useAppStore((s) => getUpcomingGroups(s, nowMinute));
  const allTasks = useAppStore(getAllTasks);
  const inboxTasks = useAppStore(getInboxTasks);
  const contexts = useAppStore(selectContexts);
  const allTags = useAppStore(getAllTags);
  const loaded = useAppStore((s) => s.loaded);
  const { isWideUp, isTabletUp } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const t = useT();

  const [view, setView] = useState<TodayView>("list");
  const [query, setQuery] = useState("");
  const [contextId, setContextId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [pickSheetOpen, setPickSheetOpen] = useState(false);
  const [deferSheetOpen, setDeferSheetOpen] = useState(false);
  const [viewsSheetOpen, setViewsSheetOpen] = useState(false);

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

  const now = Date.now();
  const dayStart = startOfDay(now);
  const overdueCount = filtered.filter(
    (task) => task.dueAt !== null && task.dueAt < dayStart,
  ).length;
  const todayCount = filtered.length - overdueCount;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top }}>
        <PageHeader
          title={formatDateLabel(now)}
          subtitle={t("app.today.counts", { overdue: overdueCount, today: todayCount })}
          actions={
            <IconButton
              icon="stats-chart-outline"
              onPress={() => router.push("/insights")}
              accessibilityLabel={t("app.today.openInsights")}
            />
          }
        />
      </View>
      <View style={styles.countRow}>
        <Badge
          label={`${t("app.today.overdue")} ${String(overdueCount)}`}
          tone={overdueCount > 0 ? "danger" : "neutral"}
        />
        <Badge label={`${t("app.today.today")} ${String(todayCount)}`} />
      </View>
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
        options={
          isWideUp
            ? [
                { key: "list", label: t("view.list") },
                { key: "upcoming", label: t("view.upcoming") },
                { key: "calendar", label: t("view.calendar") },
                { key: "timeline", label: t("view.timeline") },
              ]
            : [
                { key: "list", label: t("view.list") },
                { key: "upcoming", label: t("view.upcoming") },
              ]
        }
        trailing={
          <View style={styles.trailing}>
            {view === "list" ? (
              <IconButton
                icon="swap-vertical"
                filled={interactions.reorderMode}
                onPress={interactions.toggleReorderMode}
                accessibilityLabel={t("task.dragHandle")}
              />
            ) : null}
            {isWideUp ? null : (
              <IconButton
                icon="calendar-outline"
                onPress={() => setViewsSheetOpen(true)}
                accessibilityLabel={t("view.more")}
              />
            )}
          </View>
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
          onDefer={() => setDeferSheetOpen(true)}
          onClear={interactions.clearSelection}
          onExit={interactions.exitSelection}
        />
      ) : null}

      <OptionSheet
        visible={deferSheetOpen}
        title={t("bulk.deferTo")}
        options={DEFER_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
        onSelect={(key) => {
          setDeferSheetOpen(false);
          void interactions.deferSelected(key as DeferPreset);
        }}
        onClose={() => setDeferSheetOpen(false)}
      />

      <OptionSheet
        visible={viewsSheetOpen}
        title={t("view.more")}
        options={[{ key: "calendar", label: t("view.calendar") }]}
        onSelect={(key) => {
          setViewsSheetOpen(false);
          setView(key as TodayView);
        }}
        onClose={() => setViewsSheetOpen(false)}
      />

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

/** 顶部日期：中文「11月1日 · 周六」/ 英文「Nov 1 · Sat」 */
function formatDateLabel(now: number): string {
  const locale = getLang() === "en" ? "en-US" : "zh-CN";
  try {
    const date = new Date(now);
    const monthDay = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    return `${monthDay} · ${weekday}`;
  } catch {
    return new Date(now).toLocaleDateString();
  }
}

const styles = StyleSheet.create({
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
});

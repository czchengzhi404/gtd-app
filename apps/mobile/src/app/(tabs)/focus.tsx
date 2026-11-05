import { useMemo } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  EmptyState,
  Pomodoro,
  Screen,
  SectionHeader,
  SegmentedControl,
  TaskList,
  space,
  useAppStore,
  useNowMinute,
  useT,
} from "@gtd/ui";
import { getAllTasks, getTodayTasks, runCommand, selectContexts } from "@gtd/core";
import { useTaskActions } from "@/hooks/useRowActions";
import { openTaskContextMenu } from "@/lib/context-menu";
import { completeTaskWithUndo } from "@/lib/task-ops";

/** 专注时长预设：25 番茄钟 / 45 中块 / 90 深度块（写作者常用 45–90） */
type FocusMinutes = "25" | "45" | "90";
const FOCUS_MINUTES: FocusMinutes[] = ["25", "45", "90"];

/** 专注：番茄钟 + 已选中的下一步行动 + 今日到期 */
export default function FocusScreen() {
  const allTasks = useAppStore(getAllTasks);
  const nowMinute = useNowMinute();
  const todayTasks = useAppStore((s) => getTodayTasks(s, nowMinute));
  const contexts = useAppStore(selectContexts);
  const loaded = useAppStore((s) => s.loaded);
  const storedMinutes = useAppStore((s) => s.kv["focus.minutes"]);
  const t = useT();
  const actions = useTaskActions();

  const focusMinutes = (FOCUS_MINUTES.includes(storedMinutes as FocusMinutes)
    ? storedMinutes
    : "25") as FocusMinutes;

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contexts) map[c.id] = c.name;
    return map;
  }, [contexts]);

  if (!loaded) return null;

  const starred = allTasks
    .filter((task) => task.starred && task.status !== "done")
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));

  // 两个分区都空时只渲染一个空态，避免连续两块"没有内容"
  const allEmpty = starred.length === 0 && todayTasks.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <SegmentedControl<FocusMinutes>
          accessibilityLabel={t("focus.minutesA11y")}
          value={focusMinutes}
          onChange={(key) =>
            void runCommand("settings.set", { key: "focus.minutes", value: key }).catch(
              () => undefined,
            )
          }
          items={FOCUS_MINUTES.map((key) => ({
            key,
            label: t("focus.minutesItem", { n: key }),
          }))}
        />
      </View>
      <Pomodoro
        minutes={Number(focusMinutes)}
        currentTask={starred[0]}
        onCompleteTask={(current) => {
          // Pomodoro 回调是宽松的 {id,title} 结构；这里换回完整 Task 再走撤销式完成
          const full = allTasks.find((candidate) => candidate.id === current.id);
          if (full !== undefined) void completeTaskWithUndo(full);
        }}
      />
      {allEmpty ? (
        <EmptyState
          illustration="focus"
          title={t("focus.emptyStarred")}
          hint={t("focus.emptyStarredHint")}
          action={{
            label: t("nav.inbox"),
            icon: "file-tray-outline",
            onPress: () => router.navigate("/"),
          }}
        />
      ) : (
        <>
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
        </>
      )}
    </View>
  );
}

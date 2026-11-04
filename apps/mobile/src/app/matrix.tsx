import { useMemo, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Badge,
  Card,
  Divider,
  DueDateChip,
  OptionSheet,
  PriorityBadge,
  Skeleton,
  TaskRow,
  hit,
  radius,
  showToast,
  space,
  useAppStore,
  useBreakpoint,
  useTheme,
  useT,
} from "@gtd/ui";
import { groupByQuadrant, runCommand } from "@gtd/core";
import type { Quadrant, Task } from "@gtd/core";

import { completeTaskWithUndo, deleteTaskWithUndo } from "@/lib/task-ops";

/**
 * 艾森豪威尔四象限。
 *
 * 宽屏（≥1024）2×2 网格，窄屏纵向四段（q1→q4）。
 * 行的长按菜单只做三件事：提升优先级、选入/移出专注、删除——
 * 都是"重新分类"动作，不在矩阵里塞完整详情编辑。
 */

interface QuadrantMeta {
  key: Quadrant;
  labelKey: string;
  hintKey: string;
  color: string;
}

export default function MatrixScreen() {
  const colors = useTheme();
  const t = useT();
  const { isDesktopUp } = useBreakpoint();
  const state = useAppStore((s) => s);
  const loaded = useAppStore((s) => s.loaded);

  const [menuTask, setMenuTask] = useState<Task | null>(null);

  const tasks = useMemo(
    () =>
      Object.values(state.tasks).filter(
        (task) => task.deletedAt === null && task.status !== "done",
      ),
    [state.tasks],
  );
  const groups = useMemo(
    () => groupByQuadrant(tasks, Date.now(), state.projects),
    [tasks, state.projects],
  );

  const quadrants: QuadrantMeta[] = useMemo(
    () => [
      {
        key: "q1",
        labelKey: "app.matrix.q1",
        hintKey: "app.matrix.q1Hint",
        color: colors.danger,
      },
      { key: "q2", labelKey: "app.matrix.q2", hintKey: "app.matrix.q2Hint", color: colors.primary },
      { key: "q3", labelKey: "app.matrix.q3", hintKey: "app.matrix.q3Hint", color: colors.warning },
      {
        key: "q4",
        labelKey: "app.matrix.q4",
        hintKey: "app.matrix.q4Hint",
        color: colors.textSecondary,
      },
    ],
    [colors],
  );

  const onSelectMenu = (key: string) => {
    const task = menuTask;
    setMenuTask(null);
    if (task === null) return;
    if (key === "promote") {
      const priority = Math.min(3, task.priority + 1) as 0 | 1 | 2 | 3;
      void runCommand("task.update", { id: task.id, patch: { priority } })
        .then(() => showToast({ message: t("app.matrix.promoted"), tone: "success" }))
        .catch(() => undefined);
      return;
    }
    if (key === "focus") {
      const starred = !task.starred;
      void runCommand("task.update", { id: task.id, patch: { starred } })
        .then(() =>
          showToast({
            message: t(starred ? "app.matrix.starred" : "app.matrix.unstarred"),
            tone: "success",
          }),
        )
        .catch(() => undefined);
      return;
    }
    if (key === "delete") {
      void deleteTaskWithUndo(task);
    }
  };

  if (!loaded) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
        <View style={styles.loading}>
          <Skeleton height={hit.min} radius={radius.sm} />
          <Skeleton height={200} radius={radius.md} />
          <Skeleton height={200} radius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <AppText variant="caption" tone="secondary" lines={2} style={styles.legend}>
            {t("app.matrix.legend")}
          </AppText>

          <View style={isDesktopUp ? styles.grid : styles.stack}>
            {quadrants.map((quadrant) => {
              const quadrantTasks = groups[quadrant.key];
              return (
                <View
                  key={quadrant.key}
                  style={isDesktopUp ? styles.cellWide : styles.cellNarrow}
                >
                  <Card variant="outline" padding="normal" style={styles.quadrantCard}>
                    <View style={styles.quadrantHead}>
                      <View style={[styles.dot, { backgroundColor: quadrant.color }]} />
                      <View style={styles.quadrantTitles}>
                        <AppText variant="bodyStrong" lines={1} color={quadrant.color}>
                          {t(quadrant.labelKey)}
                        </AppText>
                        <AppText variant="caption" tone="tertiary" lines={1}>
                          {t(quadrant.hintKey)}
                        </AppText>
                      </View>
                      <Badge label={t("app.matrix.count", { n: quadrantTasks.length })} />
                    </View>

                    {quadrantTasks.length === 0 ? (
                      <AppText variant="label" tone="tertiary" lines={1} style={styles.emptyText}>
                        {t("app.matrix.empty")}
                      </AppText>
                    ) : (
                      <View>
                        {quadrantTasks.map((task, index) => (
                          <View key={task.id}>
                            {index > 0 ? <Divider /> : null}
                            <TaskRow
                              title={task.title}
                              onToggle={() => void completeTaskWithUndo(task)}
                              onPress={() => router.push(`/task/${task.id}`)}
                              onLongPress={() => setMenuTask(task)}
                              accent={quadrant.color}
                              meta={
                                <>
                                  <PriorityBadge priority={task.priority} />
                                  <DueDateChip task={task} now={Date.now()} />
                                </>
                              }
                            />
                          </View>
                        ))}
                      </View>
                    )}
                  </Card>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <OptionSheet
        visible={menuTask !== null}
        title={t("app.matrix.menuTitle")}
        options={[
          { key: "promote", label: t("app.matrix.promote") },
          {
            key: "focus",
            label: menuTask?.starred === true ? t("app.matrix.unfocus") : t("app.matrix.focus"),
          },
          { key: "delete", label: t("app.matrix.delete") },
        ]}
        onSelect={onSelectMenu}
        onClose={() => setMenuTask(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: space.xxl,
  },
  column: {
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
  },
  legend: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  loading: {
    padding: space.lg,
    gap: space.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  stack: {
    flexDirection: "column",
  },
  cellWide: {
    width: "50%",
  },
  cellNarrow: {
    width: "100%",
  },
  quadrantCard: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    gap: space.sm,
    flex: 1,
  },
  quadrantHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  dot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
  },
  quadrantTitles: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  emptyText: {
    paddingVertical: space.md,
  },
});

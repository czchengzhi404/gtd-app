import { useMemo } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { Divider, EmptyState, Screen, SectionHeader, TaskRow, useAppStore, useT } from "@gtd/ui";
import { runCommand } from "@gtd/core";

/** 完成记录：按完成日期分组归档，可一键恢复 */
export default function CompletedScreen() {
  const allTasks = useAppStore((s) => s.tasks);
  const t = useT();

  const groups = useMemo(() => {
    const done = Object.values(allTasks)
      .filter((task) => task.deletedAt === null && task.status === "done" && task.completedAt !== null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    const buckets = new Map<number, typeof done>();
    for (const task of done) {
      const dayStart = new Date(task.completedAt ?? 0).setHours(0, 0, 0, 0);
      const list = buckets.get(dayStart) ?? [];
      list.push(task);
      buckets.set(dayStart, list);
    }
    return [...buckets.entries()].sort((a, b) => b[0] - a[0]);
  }, [allTasks]);

  if (groups.length === 0) {
    return (
      <Screen>
        <EmptyState
          illustration="done"
          title={t("completed.empty")}
          hint={t("completed.emptyHint")}
        />
      </Screen>
    );
  }

  const todayStart = new Date().setHours(0, 0, 0, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          {groups.map(([dayStart, tasks]) => {
            const offset = Math.round((todayStart - dayStart) / 86400000);
            const date = new Date(dayStart);
            const label =
              offset === 0
                ? t("completed.today")
                : offset === 1
                  ? t("completed.yesterday")
                  : `${date.getMonth() + 1}/${date.getDate()}`;

            return (
              <View key={dayStart}>
                <SectionHeader
                  title={label}
                  trailing={
                    <View style={styles.countWrap}>
                      {/* 计数用纯文本，避免额外依赖 */}
                    </View>
                  }
                />
                <View style={[styles.card, { borderColor: "#0000001A" }]}>
                  {tasks.map((task, index) => (
                    <View key={task.id}>
                      {index > 0 ? <Divider inset={16} /> : null}
                      <TaskRow
                        title={task.title}
                        done
                        onToggle={() =>
                          void runCommand("task.uncomplete", { id: task.id }).catch(() => undefined)
                        }
                        onPress={() => router.push(`/task/${task.id}`)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  countWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
});

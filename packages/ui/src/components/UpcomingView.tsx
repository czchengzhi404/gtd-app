import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@gtd/core";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { EmptyState } from "./EmptyState";
import { TaskRow } from "./TaskRow";
import { Divider } from "../theme/primitives";
import { useT } from "../i18n";
import { space } from "../theme/tokens";

export interface UpcomingGroup {
  key: string;
  dayStart: number;
  tasks: Task[];
}

export interface UpcomingViewProps {
  groups: UpcomingGroup[];
  now: number;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  emptyTitle?: string;
  emptyHint?: string;
}

/**
 * 未来视图：按日分组的到期任务（比日历轻、比 Timeline 普适）。
 * 组头显示「明天 · 周三」这类相对日期，组内按时刻排序。
 */
export function UpcomingView({
  groups,
  now,
  onToggleTask,
  onPressTask,
  emptyTitle,
  emptyHint,
}: UpcomingViewProps) {
  const colors = useTheme();
  const t = useT();

  if (groups.length === 0) {
    return <EmptyState title={emptyTitle ?? t("upcoming.empty")} hint={emptyHint ?? t("upcoming.emptyHint")} />;
  }

  const todayStart = new Date(now).setHours(0, 0, 0, 0);

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.canvas }}>
      <View style={styles.column}>
        {groups.map((group) => {
          const offset = Math.round((group.dayStart - todayStart) / 86400000);
          const date = new Date(group.dayStart);
          const weekday = t(`weekday.${date.getDay()}`);
          const relative =
            offset === 1 ? t("due.tomorrow") : offset === 2 ? t("upcoming.dayAfter") : null;
          const label = relative !== null ? `${relative} · ${weekday}` : `${date.getMonth() + 1}/${date.getDate()} · ${weekday}`;

          return (
            <View key={group.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Ionicons name="calendar-outline" size={13} color={colors.textTertiary} />
                <AppText variant="label" weight="600" tone="secondary" lines={1}>
                  {label}
                </AppText>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {t("projects.openCount", { n: group.tasks.length })}
                </AppText>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {group.tasks.map((task, index) => (
                  <View key={task.id}>
                    {index > 0 ? <Divider inset={space.lg} /> : null}
                    <TaskRow
                      title={task.title}
                      done={task.status === "done"}
                      onToggle={() => onToggleTask(task)}
                      onPress={() => onPressTask(task)}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.xxl,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  group: {
    marginTop: space.md,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  card: {
    marginHorizontal: space.lg,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});

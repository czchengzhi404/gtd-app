import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Task } from "@gtd/core";
import { startOfDay } from "@gtd/core";
import { useTheme } from "../hooks/useTheme";
import { radius, spacing } from "../tokens";
import { PriorityBadge } from "./PriorityBadge";

export interface TimelineViewProps {
  tasks: Task[];
  now: number;
  /** 展示天数窗口（默认 14 天，含逾期分组） */
  days?: number;
}

interface DayGroup {
  key: string;
  label: string;
  tasks: { task: Task; timeLabel: string | null }[];
}

/**
 * Timeline（≥1440 只读）：按日分组的横向时间轴纵列。
 * 时间精确到分（默认 18:00 视为仅日期，不显示时刻）。
 */
export function TimelineView({ tasks, now, days = 14 }: TimelineViewProps) {
  const colors = useTheme();
  const groups: DayGroup[] = [];

  const overdue = tasks
    .filter((t) => t.dueAt !== null && t.status !== "done" && t.dueAt < startOfDay(now))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  if (overdue.length > 0) {
    groups.push({
      key: "overdue",
      label: "已逾期",
      tasks: overdue.map((task) => ({ task, timeLabel: null })),
    });
  }

  for (let offset = 0; offset < days; offset++) {
    const dayStart = startOfDay(now) + offset * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const dayTasks = tasks
      .filter((t) => t.dueAt !== null && t.status !== "done" && t.dueAt >= dayStart && t.dueAt < dayEnd)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    if (dayTasks.length === 0) continue;
    const date = new Date(dayStart);
    const label = offset === 0 ? "今天" : offset === 1 ? "明天" : `${date.getMonth() + 1}/${date.getDate()}`;
    groups.push({
      key: `day-${dayStart}`,
      label,
      tasks: dayTasks.map((task) => {
        const d = new Date(task.dueAt ?? 0);
        const isDefault = d.getHours() === 18 && d.getMinutes() === 0;
        return {
          task,
          timeLabel: isDefault ? null : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        };
      }),
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {groups.length === 0 ? (
        <Text style={{ color: colors.textSecondary, padding: spacing.lg }}>未来 {days} 天没有到期任务</Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text
            accessibilityRole="header"
            style={[styles.groupLabel, { color: group.key === "overdue" ? colors.danger : colors.text }]}
          >
            {group.label}
          </Text>
          {group.tasks.map(({ task, timeLabel }) => (
            <View key={task.id} style={[styles.item, { borderLeftColor: colors.border }]}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={styles.itemBody}>
                <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                  {task.title}
                </Text>
                <View style={styles.itemMeta}>
                  <PriorityBadge priority={task.priority} />
                  {timeLabel !== null ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{timeLabel}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  item: {
    flexDirection: "row",
    borderLeftWidth: 2,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  itemBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  itemTitle: {
    fontSize: 16,
    lineHeight: 24,
    flexShrink: 1,
  },
  itemMeta: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
});

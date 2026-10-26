import { ScrollView, StyleSheet, View } from "react-native";
import type { Task } from "@gtd/core";
import { startOfDay } from "@gtd/core";

import { useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { PriorityBadge } from "./PriorityBadge";
import { radius, space } from "../theme/tokens";

export interface TimelineViewProps {
  tasks: Task[];
  now: number;
  /** 展示天数窗口（默认 14 天，含逾期分组） */
  days?: number;
}

interface DayGroup {
  key: string;
  label: string;
  overdue: boolean;
  items: { task: Task; timeLabel: string }[];
}

/** Timeline（≥1440 只读）：按日分组的时间轴，日期列固定宽度，内容单行省略 */
export function TimelineView({ tasks, now, days = 14 }: TimelineViewProps) {
  const colors = useTheme();
  const tr = useT();
  const groups: DayGroup[] = [];

  const overdue = tasks
    .filter((task) => task.dueAt !== null && task.status !== "done" && task.dueAt < startOfDay(now))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  if (overdue.length > 0) {
    groups.push({
      key: "overdue",
      label: tr("timeline.overdue"),
      overdue: true,
      items: overdue.map((task) => ({ task, timeLabel: timeOf(task) })),
    });
  }

  for (let offset = 0; offset < days; offset++) {
    const dayStart = startOfDay(now) + offset * 86400000;
    const dayEnd = dayStart + 86400000;
    const dayTasks = tasks
      .filter((task) => task.dueAt !== null && task.status !== "done" && task.dueAt >= dayStart && task.dueAt < dayEnd)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    if (dayTasks.length === 0) continue;
    const date = new Date(dayStart);
    const label =
      offset === 0
        ? tr("due.today")
        : offset === 1
          ? tr("due.tomorrow")
          : `${date.getMonth() + 1}/${date.getDate()}`;
    groups.push({
      key: `day-${dayStart}`,
      label,
      overdue: false,
      items: dayTasks.map((task) => ({ task, timeLabel: timeOf(task) })),
    });
  }

  if (groups.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <AppText variant="label" tone="tertiary" align="center" lines={2}>
          {tr("timeline.empty", { days })}
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <View style={styles.dateCol}>
            <AppText
              variant="label"
              weight="700"
              color={group.overdue ? colors.danger : colors.textSecondary}
              lines={1}
            >
              {group.label}
            </AppText>
          </View>
          <View style={styles.items}>
            {group.items.map(({ task, timeLabel }) => (
              <View key={task.id} style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.timeCol}>
                  <AppText variant="caption" tone="tertiary" lines={1}>
                    {timeLabel}
                  </AppText>
                </View>
                <AppText variant="body" lines={1} style={styles.title}>
                  {task.title}
                </AppText>
                <PriorityBadge priority={task.priority} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function timeOf(task: Task): string {
  if (task.dueAt === null) return "";
  const d = new Date(task.dueAt);
  if (d.getHours() === 18 && d.getMinutes() === 0) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  wrap: {
    padding: space.lg,
    gap: space.lg,
  },
  group: {
    flexDirection: "row",
    gap: space.md,
  },
  dateCol: {
    width: 64,
    paddingTop: space.sm,
  },
  items: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  item: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timeCol: {
    width: 40,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
  },
});

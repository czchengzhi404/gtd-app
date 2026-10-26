import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@gtd/core";
import { startOfDay } from "@gtd/core";

import { t, tList, useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { IconButton } from "../theme/primitives";
import { radius, space } from "../theme/tokens";

export interface CalendarViewProps {
  tasks: Task[];
  now: number;
  onPressTask: (task: Task) => void;
}

/**
 * 月历：6 行 × 7 列固定网格，日格 46px 高。
 * 无论当月多少天、多少任务，网格尺寸恒定，不会出现布局跳动。
 */
export function CalendarView({ tasks, now, onPressTask }: CalendarViewProps) {
  const colors = useTheme();
  const tr = useT();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number>(() => startOfDay(now));

  const weekdays = tList("calendar.weekdays");
  const base = new Date(now);
  const cursor = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map<number, Task[]>();
  for (const task of tasks) {
    if (task.dueAt === null || task.status === "done") continue;
    const d = new Date(task.dueAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const list = byDay.get(d.getDate()) ?? [];
    list.push(task);
    byDay.set(d.getDate(), list);
  }

  const selectedDate = new Date(selectedDay);
  const sameMonth = selectedDate.getFullYear() === year && selectedDate.getMonth() === month;
  const selectedTasks = sameMonth ? (byDay.get(selectedDate.getDate()) ?? []) : [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.monthRow}>
        <IconButton
          icon="chevron-back"
          onPress={() => setMonthOffset((m) => m - 1)}
          accessibilityLabel={tr("calendar.prevMonth")}
        />
        <AppText variant="bodyStrong" lines={1}>
          {tr("calendar.month", { y: year, m: month + 1 })}
        </AppText>
        <IconButton
          icon="chevron-forward"
          onPress={() => setMonthOffset((m) => m + 1)}
          accessibilityLabel={tr("calendar.nextMonth")}
        />
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((label) => (
          <View key={label} style={styles.weekCell}>
            <AppText variant="caption" tone="tertiary" align="center" lines={1}>
              {label}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: firstWeekday }, (_, i) => (
          <View key={`pad-${i}`} style={styles.cell} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dayTasks = byDay.get(day) ?? [];
          const dayStart = new Date(year, month, day).getTime();
          const isToday = dayStart === startOfDay(now);
          const isSelected = sameMonth && day === selectedDate.getDate();
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={tr("calendar.dayA11y", { m: month + 1, d: day, n: dayTasks.length })}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedDay(dayStart)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: isSelected
                    ? colors.primary
                    : isToday
                      ? colors.primaryMuted
                      : pressed
                        ? colors.surfaceMuted
                        : "transparent",
                },
              ]}
            >
              <AppText
                variant="label"
                weight={isSelected || isToday ? "700" : "500"}
                color={isSelected ? colors.onPrimary : isToday ? colors.primary : colors.text}
                align="center"
                lines={1}
              >
                {day}
              </AppText>
              {dayTasks.length > 0 ? (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isSelected ? colors.onPrimary : colors.primary },
                  ]}
                />
              ) : (
                <View style={styles.dotPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.daySection}>
        <AppText variant="caption" tone="tertiary" lines={1}>
          {sameMonth ? tr("calendar.month", { y: year, m: month + 1 }) : tr("calendar.wrongMonth")}
        </AppText>
        {sameMonth && selectedTasks.length === 0 ? (
          <AppText variant="label" tone="tertiary" lines={1}>
            {tr("calendar.emptyDay")}
          </AppText>
        ) : null}
        {selectedTasks.map((task) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            accessibilityLabel={tr("task.a11yOpen", { title: task.title })}
            onPress={() => onPressTask(task)}
            style={({ pressed }) => [
              styles.taskItem,
              { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="ellipse" size={7} color={colors.primary} />
            <AppText variant="body" lines={1} style={styles.taskTitle}>
              {task.title}
            </AppText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.xxl,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  weekRow: {
    flexDirection: "row",
    paddingHorizontal: space.md,
  },
  weekCell: {
    width: `${100 / 7}%` as never,
    paddingVertical: space.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: space.md,
  },
  cell: {
    width: `${100 / 7}%` as never,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xs,
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotPlaceholder: {
    width: 5,
    height: 5,
  },
  daySection: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
  },
  taskItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  taskTitle: {
    flex: 1,
    minWidth: 0,
  },
});

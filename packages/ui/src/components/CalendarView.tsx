import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Task } from "@gtd/core";
import { startOfDay } from "@gtd/core";
import { t, tList, useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { radius, spacing } from "../tokens";

export interface CalendarViewProps {
  tasks: Task[];
  now: number;
  onPressTask: (task: Task) => void;
}

/** 月历视图：日格显示到期任务计数，点选日期在下方列出当日任务（只读） */
export function CalendarView({ tasks, now, onPressTask }: CalendarViewProps) {
  const colors = useTheme();
  const t = useT();
  const focus = useFocusStyle(radius.sm);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number>(() => startOfDay(now));
  const WEEKDAY_LABELS = tList("calendar.weekdays");

  const base = new Date(now);
  const cursor = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map<number, Task[]>();
  for (const task of tasks) {
    if (task.dueAt === null || task.status === "done") continue;
    const d = new Date(task.dueAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    const list = byDay.get(day) ?? [];
    list.push(task);
    byDay.set(day, list);
  }

  const selectedTasks =
    byDay.get(new Date(selectedDay).getDate()) ?? [];
  const sameMonth = new Date(selectedDay).getFullYear() === year && new Date(selectedDay).getMonth() === month;

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.prevMonth")}
          onPress={() => setMonthOffset((m) => m - 1)}
          style={({ pressed }) => [styles.nav, focus, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text maxFontSizeMultiplier={1.2} style={{ color: colors.text, fontSize: 18 }}>‹</Text>
        </Pressable>
        <Text maxFontSizeMultiplier={1.2} accessibilityRole="header" style={[styles.monthTitle, { color: colors.text }]}>
          {t("calendar.month", { y: year, m: month + 1 })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.nextMonth")}
          onPress={() => setMonthOffset((m) => m + 1)}
          style={({ pressed }) => [styles.nav, focus, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text maxFontSizeMultiplier={1.2} style={{ color: colors.text, fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text maxFontSizeMultiplier={1.2} key={label} style={[styles.weekday, { color: colors.textSecondary }]}>
            {label}
          </Text>
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
          const isSelected = sameMonth && day === new Date(selectedDay).getDate();
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={t("calendar.dayA11y", { m: month + 1, d: day, n: dayTasks.length })}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedDay(dayStart)}
              style={({ pressed }) => [
                styles.cell,
                focus,
                {
                  backgroundColor: isSelected
                    ? colors.primary
                    : isToday
                      ? colors.surface
                      : pressed
                        ? colors.surface
                        : "transparent",
                },
              ]}
            >
              <Text maxFontSizeMultiplier={1.2}
                style={[
                  styles.dayNum,
                  {
                    color: isSelected ? colors.onPrimary : isToday ? colors.primary : colors.text,
                  },
                ]}
              >
                {day}
              </Text>
              {dayTasks.length > 0 ? (
                <View style={[styles.badge, { backgroundColor: isSelected ? colors.onPrimary : colors.primary }]}>
                  <Text maxFontSizeMultiplier={1.2} style={{ color: isSelected ? colors.primary : colors.onPrimary, fontSize: 10 }}>
                    {dayTasks.length}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dayList}>
        {sameMonth ? null : (
          <Text maxFontSizeMultiplier={1.2} style={{ color: colors.textSecondary, padding: spacing.md }}>{t("calendar.wrongMonth")}</Text>
        )}
        {sameMonth && selectedTasks.length === 0 ? (
          <Text maxFontSizeMultiplier={1.2} style={{ color: colors.textSecondary, padding: spacing.md }}>{t("calendar.emptyDay")}</Text>
        ) : null}
        {selectedTasks.map((task) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            accessibilityLabel={t("task.a11yOpen", { title: task.title })}
            onPress={() => onPressTask(task)}
            style={({ pressed }) => [
              styles.taskRow,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text maxFontSizeMultiplier={1.2} style={{ color: colors.text, fontSize: 16 }} numberOfLines={1}>
              {task.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  nav: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  weekRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.sm,
  },
  cell: {
    width: `${100 / 7}%` as never,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    gap: 2,
  },
  dayNum: {
    fontSize: 15,
  },
  badge: {
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
  },
  dayList: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  taskRow: {
    minHeight: 44,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
});

import { StyleSheet, Text } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import type { Task } from "@gtd/core";
import { endOfDay, startOfDay } from "@gtd/core";

/** 到期时间徽标：逾期红、今天主色、未来次级色。recurrence 显示重复标记。 */
export function DueDateChip({ task, now }: { task: Pick<Task, "dueAt" | "recurrence" | "status">; now: number }) {
  const colors = useTheme();
  if (task.dueAt === null) return null;
  const done = task.status === "done";
  const overdue = !done && task.dueAt < startOfDay(now);
  const today = !done && task.dueAt <= endOfDay(now);
  const d = new Date(task.dueAt);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  const hasMeaningfulTime = d.getHours() !== 18 || d.getMinutes() !== 0; // 18:00 为默认（仅日期）
  const label = `${task.recurrence ? "↻ " : ""}${date}${hasMeaningfulTime ? ` ${time}` : ""}`;
  const color = overdue ? colors.danger : today ? colors.primary : colors.textSecondary;
  return (
    <Text maxFontSizeMultiplier={1.2}
      accessibilityRole="text"
      accessibilityLabel={overdue ? t("task.dueA11y", { label }) : t("task.dueA11yOk", { label })}
      style={[styles.label, { color }]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
});

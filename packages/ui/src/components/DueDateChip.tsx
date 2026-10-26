import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@gtd/core";
import { endOfDay, startOfDay } from "@gtd/core";

import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { radius, space } from "../theme/tokens";

export interface DueDateChipProps {
  task: Pick<Task, "dueAt" | "recurrence" | "status">;
  now: number;
}

/**
 * 到期时间：图标 + 日期。逾期红、今天/明天用主色并显示相对词。
 * 全部为固定尺寸，19px 高，不参与行高计算。
 */
export function DueDateChip({ task, now }: DueDateChipProps) {
  const colors = useTheme();
  if (task.dueAt === null) return null;

  const done = task.status === "done";
  const due = task.dueAt;
  const todayStart = startOfDay(now);
  const overdue = !done && due < todayStart;
  const isToday = due >= todayStart && due <= endOfDay(now);
  const isTomorrow = due >= todayStart + 86400000 && due <= endOfDay(now + 86400000);

  const d = new Date(due);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const showTime = !(d.getHours() === 18 && d.getMinutes() === 0);
  const dateLabel = isToday
    ? t("due.today")
    : isTomorrow
      ? t("due.tomorrow")
      : `${d.getMonth() + 1}/${d.getDate()}`;
  const label = showTime ? `${dateLabel} ${time}` : dateLabel;

  const tone = overdue ? colors.danger : isToday || isTomorrow ? colors.primary : colors.textTertiary;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        overdue ? t("task.dueA11y", { label }) : t("task.dueA11yOk", { label })
      }
      style={styles.wrap}
    >
      <Ionicons name={task.recurrence !== null ? "repeat" : "time-outline"} size={12} color={tone} />
      <AppText variant="caption" color={tone} lines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 20,
    paddingRight: space.xxs,
    borderRadius: radius.xs,
    flexShrink: 0,
  },
});

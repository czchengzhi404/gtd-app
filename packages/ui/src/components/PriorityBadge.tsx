import { StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { radius } from "../tokens";

export type PriorityLevel = 0 | 1 | 2 | 3;

const LABELS: Record<PriorityLevel, string> = {
  0: "",
  1: "P1",
  2: "P2",
  3: "P3",
};

/** 优先级徽标：0 不渲染；3 最高（danger 色） */
export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const colors = useTheme();
  if (priority === 0) return null;
  const bg = priority === 3 ? colors.danger : colors.surface;
  const fg = priority === 3 ? "#FFFFFF" : colors.textSecondary;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={t("task.priorityA11y", { n: priority })}
      style={[styles.badge, { backgroundColor: bg }]}
    >
      <Text style={[styles.label, { color: fg }]}>{LABELS[priority]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});

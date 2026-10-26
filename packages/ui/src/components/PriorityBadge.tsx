import { StyleSheet, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { radius, space } from "../theme/tokens";
import { t } from "../i18n";

export type PriorityLevel = 0 | 1 | 2 | 3;

/** 优先级：小色点 + P 编号（不抢任务标题的视觉层级） */
export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const colors = useTheme();
  if (priority === 0) return null;

  const dot = priority === 3 ? colors.danger : priority === 2 ? colors.warning : colors.textTertiary;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={t("task.priorityA11y", { n: priority })}
      style={styles.wrap}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <AppText variant="caption" tone="secondary" lines={1}>
        P{priority}
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
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

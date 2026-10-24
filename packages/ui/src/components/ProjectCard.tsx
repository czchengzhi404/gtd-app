import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Project } from "@gtd/core";
import { useTheme } from "../hooks/useTheme";
import { minTouchTarget, radius, spacing } from "../tokens";

export interface ProjectCardProps {
  project: Project;
  /** 未完成任务数 */
  openCount: number;
  /** 顺序项目的下一步行动标题 */
  nextActionTitle?: string | null;
  onPress: () => void;
}

export function ProjectCard({ project, openCount, nextActionTitle, onPress }: ProjectCardProps) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开项目：${project.name}，${openCount} 个未完成任务`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {project.name}
        </Text>
        <Text style={[styles.kind, { color: colors.textSecondary }]}>
          {project.kind === "sequential" ? "顺序" : "并行"}
        </Text>
      </View>
      {nextActionTitle ? (
        <Text style={[styles.next, { color: colors.primary }]} numberOfLines={1}>
          下一步：{nextActionTitle}
        </Text>
      ) : (
        <Text style={[styles.next, { color: colors.textSecondary }]}>暂无下一步行动</Text>
      )}
      <Text style={[styles.count, { color: colors.textSecondary }]}>{openCount} 个未完成</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  name: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    flexShrink: 1,
  },
  kind: {
    fontSize: 13,
  },
  next: {
    fontSize: 15,
    lineHeight: 22,
  },
  count: {
    fontSize: 13,
  },
});

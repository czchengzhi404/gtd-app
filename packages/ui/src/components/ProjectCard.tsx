import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Project } from "@gtd/core";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { RowActions } from "./RowActions";
import { minTouchTarget, radius, spacing } from "../tokens";

export interface ProjectCardAction {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (project: Project) => void;
}

export interface ProjectCardProps {
  project: Project;
  /** 未完成任务数 */
  openCount: number;
  /** 顺序项目的下一步行动标题 */
  nextActionTitle?: string | null;
  onPress: () => void;
  /** 卡片更多操作（重命名/切换类型/删除）；不传则不渲染入口 */
  actions?: ProjectCardAction[];
}

export function ProjectCard({ project, openCount, nextActionTitle, onPress, actions }: ProjectCardProps) {
  const colors = useTheme();
  return (
    <View style={[styles.cardWrap, { backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("projects.a11yOpen", { name: project.name, n: openCount })}
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
            {t(project.kind === "sequential" ? "projects.sequential" : "projects.parallel")}
          </Text>
        </View>
        {nextActionTitle ? (
          <Text style={[styles.next, { color: colors.primary }]} numberOfLines={1}>
            {t("projects.next")}
            {nextActionTitle}
          </Text>
        ) : (
          <Text style={[styles.next, { color: colors.textSecondary }]}>{t("projects.noneNext")}</Text>
        )}
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {t("projects.openCount", { n: openCount })}
        </Text>
      </Pressable>
      {actions !== undefined && actions.length > 0 ? (
        <View style={styles.actions}>
          <RowActions
            accessibilityLabel={t("common.moreActions")}
            actions={actions.map((action) => ({
              key: action.key,
              label: action.label,
              danger: action.danger,
              onSelect: () => action.onSelect(project),
            }))}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    minHeight: minTouchTarget,
  },
  card: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  actions: {
    paddingRight: spacing.xs,
    alignItems: "center",
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

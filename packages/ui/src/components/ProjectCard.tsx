import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Project } from "@gtd/core";

import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Card } from "../theme/primitives";
import { RowActions, type ActionItem } from "./RowActions";
import { radius, space } from "../theme/tokens";

export interface ProjectCardProps {
  project: Project;
  openCount: number;
  nextActionTitle?: string | null;
  onPress: () => void;
  actions?: ActionItem[] | { key: string; label: string; danger?: boolean; onSelect: (p: Project) => void }[];
}

/** 项目卡片：名称 / 类型 / 下一步行动 / 未完成数 */
export function ProjectCard({
  project,
  openCount,
  nextActionTitle,
  onPress,
  actions,
}: ProjectCardProps) {
  const colors = useTheme();
  const resolvedActions: ActionItem[] | undefined = actions?.map((action) => ({
    key: action.key,
    label: action.label,
    danger: action.danger,
    onSelect: () => (action.onSelect as (p: Project) => void)(project),
  }));

  return (
    <View style={styles.wrap}>
      <Card
        onPress={onPress}
        accessibilityLabel={t("projects.a11yOpen", { name: project.name, n: openCount })}
        style={styles.card}
      >
        <View style={styles.titleRow}>
          <AppText variant="bodyStrong" lines={1} style={styles.name}>
            {project.name}
          </AppText>
          <View style={[styles.kindPill, { backgroundColor: colors.surfaceMuted }]}>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {t(project.kind === "sequential" ? "projects.sequential" : "projects.parallel")}
            </AppText>
          </View>
        </View>

        <View style={styles.nextRow}>
          <Ionicons
            name={nextActionTitle !== null && nextActionTitle !== undefined ? "arrow-forward" : "alert-circle-outline"}
            size={13}
            color={nextActionTitle !== null && nextActionTitle !== undefined ? colors.primary : colors.warning}
          />
          <AppText
            variant="label"
            color={nextActionTitle !== null && nextActionTitle !== undefined ? colors.primary : colors.warning}
            lines={1}
            style={styles.next}
          >
            {nextActionTitle !== null && nextActionTitle !== undefined
              ? `${t("projects.next")}${nextActionTitle}`
              : t("projects.noneNext")}
          </AppText>
        </View>

        <AppText variant="caption" tone="tertiary" lines={1}>
          {t("projects.openCount", { n: openCount })}
        </AppText>
      </Card>

      {resolvedActions !== undefined && resolvedActions.length > 0 ? (
        <View style={styles.actions}>
          <RowActions actions={resolvedActions} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    gap: space.xxs,
  },
  card: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  kindPill: {
    height: 20,
    paddingHorizontal: space.sm,
    borderRadius: radius.xs,
    justifyContent: "center",
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  next: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    alignItems: "center",
    justifyContent: "center",
  },
});

import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Task } from "@gtd/core";
import { Chip } from "./Chip";
import { PriorityBadge } from "./PriorityBadge";
import { DueDateChip } from "./DueDateChip";
import { SectionHeader } from "./SectionHeader";
import { t, useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { spacing } from "../tokens";
import type { TaskStatusInput } from "@gtd/core";

const STATUS_KEYS: { status: TaskStatusInput; labelKey: string }[] = [
  { status: "inbox", labelKey: "detail.status.inbox" },
  { status: "next", labelKey: "detail.status.next" },
  { status: "waiting", labelKey: "detail.status.waiting" },
  { status: "someday", labelKey: "detail.status.someday" },
];

export interface TaskDetailContentProps {
  task: Task;
  now: number;
  projectName?: string;
  contextNames: string[];
  onMoveStatus: (status: TaskStatusInput) => void;
  onToggleStar: () => void;
  onDelete: () => void;
  onSetPriority: (priority: 0 | 1 | 2 | 3) => void;
}

/** 任务详情内容（移动全屏 / 桌面双栏右 pane 复用），文案随语言切换 */
export function TaskDetailContent({
  task,
  now,
  projectName,
  contextNames,
  onMoveStatus,
  onToggleStar,
  onDelete,
  onSetPriority,
}: TaskDetailContentProps) {
  const colors = useTheme();
  const t = useT();
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      style={{ backgroundColor: colors.bg }}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {task.title}
      </Text>

      <View style={styles.metaRow}>
        <PriorityBadge priority={task.priority} />
        <DueDateChip task={task} now={now} />
        {projectName !== undefined ? <Chip label={projectName} color={colors.success} /> : null}
        {contextNames.map((name) => (
          <Chip key={name} label={name} />
        ))}
      </View>

      <SectionHeader title={t("detail.clarify")} />
      <View style={styles.actionRow}>
        {STATUS_KEYS.map(({ status, labelKey }) => (
          <Chip
            key={status}
            label={t(labelKey)}
            selected={task.status === status}
            onPress={() => onMoveStatus(status)}
          />
        ))}
      </View>

      <SectionHeader title={t("detail.priority")} />
      <View style={styles.actionRow}>
        {([0, 1, 2, 3] as const).map((p) => (
          <Chip
            key={p}
            label={p === 0 ? t("detail.priority.none") : `P${p}`}
            selected={task.priority === p}
            onPress={() => onSetPriority(p)}
          />
        ))}
      </View>

      <SectionHeader title={t("detail.actions")} />
      <View style={styles.actionRow}>
        <Chip
          label={task.starred ? t("detail.starred") : t("detail.star")}
          selected={task.starred}
          onPress={onToggleStar}
        />
        <Chip label={t("detail.delete")} color={colors.danger} onPress={onDelete} />
      </View>

      {task.notes.length > 0 ? (
        <>
          <SectionHeader title={t("detail.notes")} />
          <Text style={[styles.notes, { color: colors.text }]}>{task.notes}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  title: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  notes: {
    fontSize: 16,
    lineHeight: 26,
    paddingHorizontal: spacing.md,
    fontFamily: "monospace",
  },
});

import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task, TaskStatusInput } from "@gtd/core";

import { SectionHeader } from "./Screen";
import { Chip } from "./Chip";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { Button, Divider } from "../theme/primitives";
import { AppText } from "../theme/AppText";
import { useTheme } from "../hooks/useTheme";
import { useT } from "../i18n";
import { radius, space } from "../theme/tokens";

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

/** 任务详情（移动全屏 / 桌面右栏复用） */
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
      style={{ backgroundColor: colors.canvas }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="title" lines={3}>
          {task.title}
        </AppText>
        <View style={styles.metaRow}>
          <PriorityBadge priority={task.priority} />
          <DueDateChip task={task} now={now} />
          {projectName !== undefined ? (
            <View style={styles.projectTag}>
              <Ionicons name="folder-outline" size={12} color={colors.success} />
              <AppText variant="caption" color={colors.success} lines={1}>
                {projectName}
              </AppText>
            </View>
          ) : null}
          {contextNames.map((name) => (
            <Chip key={name} label={name} />
          ))}
        </View>
      </View>

      <SectionHeader title={t("detail.clarify")} />
      <View style={styles.chipRow}>
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
      <View style={styles.chipRow}>
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
      <View style={styles.buttonRow}>
        <Button
          label={task.starred ? t("detail.starred") : t("detail.star")}
          icon={task.starred ? "star" : "star-outline"}
          variant={task.starred ? "primary" : "secondary"}
          onPress={onToggleStar}
        />
        <Button label={t("detail.delete")} icon="trash-outline" variant="danger" onPress={onDelete} />
      </View>

      {task.notes.length > 0 ? (
        <>
          <SectionHeader title={t("detail.notes")} />
          <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="mono" lines={200} style={styles.notes}>
              {task.notes}
            </AppText>
          </View>
        </>
      ) : null}

      <Divider />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: space.xxxl,
  },
  hero: {
    margin: space.lg,
    marginBottom: 0,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
  },
  projectTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 20,
    maxWidth: 140,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  notesCard: {
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notes: {
    fontSize: 14,
    lineHeight: 22,
  },
});

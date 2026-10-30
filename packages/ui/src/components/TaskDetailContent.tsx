import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AttachmentMeta, Task, TaskStatusInput } from "@gtd/core";

import { SectionHeader } from "./Screen";
import { Chip } from "./Chip";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { ChecklistEditor } from "./ChecklistEditor";
import { AttachmentList } from "./AttachmentList";
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
  /** 设置开始日期（defer）：null = 立即 */
  onSetDefer?: (until: number | null) => void;
  /** 清单子项 */
  onToggleChecklist?: (itemId: string) => void;
  onAddChecklist?: (title: string) => void;
  onRemoveChecklist?: (itemId: string) => void;
  /** 附件（元数据列表由调用方查询） */
  attachments?: AttachmentMeta[];
  onAddAttachment?: () => void;
  onRemoveAttachment?: (id: string) => void;
  onOpenAttachment?: (item: AttachmentMeta) => void;
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
  onSetDefer,
  onToggleChecklist,
  onAddChecklist,
  onRemoveChecklist,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  onOpenAttachment,
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

      {onSetDefer !== undefined ? (
        <>
          <SectionHeader title={t("detail.defer")} />
          <View style={styles.chipRow}>
            {(
              [
                { key: "none", offsetDays: null, labelKey: "detail.defer.none" },
                { key: "tomorrow", offsetDays: 1, labelKey: "detail.defer.tomorrow" },
                { key: "week", offsetDays: 7, labelKey: "detail.defer.nextWeek" },
              ] as const
            ).map((option) => {
              const target =
                option.offsetDays === null
                  ? null
                  : (() => {
                      const d = new Date(now);
                      d.setHours(8, 0, 0, 0);
                      d.setDate(d.getDate() + option.offsetDays);
                      return d.getTime();
                    })();
              // 选中判定：无开始日期 / 已推迟到今天之后（"明天"/"下周"用范围近似，避免精确时刻比较）
              const selected =
                target === null
                  ? task.deferUntil === null
                  : task.deferUntil !== null &&
                    Math.abs(task.deferUntil - target) < 12 * 60 * 60 * 1000;
              return (
                <Chip
                  key={option.key}
                  label={t(option.labelKey)}
                  selected={selected}
                  onPress={() => onSetDefer(target)}
                />
              );
            })}
            {task.deferUntil !== null ? (
              <AppText variant="caption" tone="tertiary" lines={1}>
                {t("detail.deferred")}：
                {new Date(task.deferUntil).toLocaleDateString()}
              </AppText>
            ) : null}
          </View>
        </>
      ) : null}

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

      {onToggleChecklist !== undefined &&
      onAddChecklist !== undefined &&
      onRemoveChecklist !== undefined ? (
        <>
          <SectionHeader title={t("detail.checklist")} />
          <View style={styles.sectionBlock}>
            <ChecklistEditor
              items={task.checklist}
              onToggle={onToggleChecklist}
              onAdd={onAddChecklist}
              onRemove={onRemoveChecklist}
            />
          </View>
        </>
      ) : null}

      {attachments !== undefined && onRemoveAttachment !== undefined ? (
        <>
          <SectionHeader title={t("detail.attachments")} />
          <View style={styles.sectionBlock}>
            <AttachmentList
              items={attachments}
              onAdd={onAddAttachment}
              onRemove={onRemoveAttachment}
              onOpen={onOpenAttachment}
            />
          </View>
        </>
      ) : null}

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
  sectionBlock: {
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

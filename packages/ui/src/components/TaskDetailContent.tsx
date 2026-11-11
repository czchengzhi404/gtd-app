import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AttachmentMeta, RecurrenceRule, Task, TaskStatusInput } from "@gtd/core";
import { countText } from "@gtd/core";

import { SectionHeader } from "./Screen";
import { Chip } from "./Chip";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { ChecklistEditor } from "./ChecklistEditor";
import { AttachmentList } from "./AttachmentList";
import { MarkdownView } from "./MarkdownView";
import { TagEditor } from "./TagEditor";
import { showConfirm } from "./PromptHost";
import { Button, Divider } from "../theme/primitives";
import { AppText } from "../theme/AppText";
import { useTheme } from "../hooks/useTheme";
import { useT } from "../i18n";
import { hit, radius, space } from "../theme/tokens";

/** 重复预设：覆盖核心的 5 种（yearly 用「每年」在同一条里循环不现实，先用 interval=1 的常见档） */
const RECURRENCE_OPTIONS: { key: string; labelKey: string; rule: RecurrenceRule | null }[] = [
  { key: "none", labelKey: "recurrence.none", rule: null },
  { key: "daily", labelKey: "recurrence.daily", rule: { freq: "daily", interval: 1 } },
  { key: "weekly", labelKey: "recurrence.weekly", rule: { freq: "weekly", interval: 1 } },
  { key: "monthly", labelKey: "recurrence.monthly", rule: { freq: "monthly", interval: 1 } },
  { key: "weekdays", labelKey: "recurrence.weekdays", rule: { freq: "weekdays", interval: 1 } },
  {
    key: "afterCompletion",
    labelKey: "recurrence.afterCompletion",
    rule: { freq: "afterCompletion", interval: 1 },
  },
];

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
  /**
   * 所属项目下的分区列表。
   * 与 onSetSection 一起传才会显示「分区」选择区——不传就当这个功能不存在，
   * 避免在没有项目的任务上露出一个空壳。
   */
  sections?: { id: string; name: string }[];
  /** 设置所属分区（null = 移出分区） */
  onSetSection?: (id: string | null) => void;
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
  /** 标签编辑（不传则只展示） */
  onSetTags?: (tags: string[]) => void;
  /** 另存为模板（不传则不显示入口） */
  onSaveAsTemplate?: () => void;
  /** 常用标签建议（来自全库在用标签） */
  tagSuggestions?: string[];
  /**
   * 保存正文（不传则正文只读展示）。
   * 写作场景的主入口：多行编辑 + 实时字数 + Markdown 预览切换。
   */
  onSaveNotes?: (notes: string) => void | Promise<void>;
  /** 导出正文（不传则不显示入口）；仅当正文非空时显示 */
  onExportNotes?: () => void;
  /** 打开正文版本历史（不传则不显示入口） */
  onOpenHistory?: () => void;
  /** 设置重复规则（不传则不显示该区） */
  onSetRecurrence?: (rule: RecurrenceRule | null) => void;
}

/** 任务详情（移动全屏 / 桌面右栏复用） */
export function TaskDetailContent({
  task,
  now,
  projectName,
  sections,
  onSetSection,
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
  onSetTags,
  onSaveAsTemplate,
  tagSuggestions = [],
  onSaveNotes,
  onExportNotes,
  onOpenHistory,
  onSetRecurrence,
}: TaskDetailContentProps) {
  const colors = useTheme();
  const t = useT();

  // 正文编辑：进入编辑态时把当前正文拷进草稿，退出时按需丢弃
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesCount = countText(task.notes);
  const draftCount = countText(notesDraft);

  const startEditNotes = () => {
    setNotesDraft(task.notes);
    setEditingNotes(true);
  };

  const cancelEditNotes = async () => {
    if (notesDraft !== task.notes) {
      const discard = await showConfirm({
        title: t("detail.notesDiscard"),
        confirmLabel: t("detail.notesDiscardConfirm"),
      });
      if (!discard) return;
    }
    setEditingNotes(false);
    setNotesDraft("");
  };

  const saveNotes = async () => {
    if (onSaveNotes === undefined) return;
    setSavingNotes(true);
    try {
      await onSaveNotes(notesDraft);
      setEditingNotes(false);
      setNotesDraft("");
    } finally {
      setSavingNotes(false);
    }
  };

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
          {task.tags.map((name) => (
            <Chip key={`tag-${name}`} label={name} prefix="#" />
          ))}
        </View>
      </View>

      {onSetSection !== undefined && (sections?.length ?? 0) > 0 ? (
        <>
          <SectionHeader title={t("task.sectionLabel")} />
          <View style={styles.chipRow}>
            <Chip
              label={t("task.noSection")}
              selected={task.sectionId === null}
              onPress={() => onSetSection(null)}
            />
            {(sections ?? []).map((section) => (
              <Chip
                key={section.id}
                label={section.name}
                selected={task.sectionId === section.id}
                onPress={() => onSetSection(section.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      {onSetTags !== undefined || task.tags.length > 0 ? (
        <>
          <SectionHeader title={t("tag.section")} />
          <View style={styles.sectionBlock}>
            <TagEditor
              tags={task.tags}
              suggestions={tagSuggestions}
              editable={onSetTags !== undefined}
              onChange={(tags) => onSetTags?.(tags)}
            />
          </View>
        </>
      ) : null}

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

      {onSetRecurrence !== undefined ? (
        <>
          <SectionHeader title={t("detail.recurrence")} />
          <View style={styles.metaRow}>
              {RECURRENCE_OPTIONS.map((option) => {
                const selected =
                  option.rule === null
                    ? task.recurrence === null
                    : task.recurrence !== null && task.recurrence.freq === option.rule.freq;
                return (
                  <Chip
                    key={option.key}
                    label={t(option.labelKey)}
                    selected={selected}
                    onPress={() => onSetRecurrence(option.rule)}
                  />
                );
              })}
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
      {onSaveAsTemplate !== undefined ? (
        <View style={styles.buttonRow}>
          <Button
            label={t("template.saveAs")}
            icon="duplicate-outline"
            variant="ghost"
            onPress={onSaveAsTemplate}
          />
          {onExportNotes !== undefined && task.notes.length > 0 ? (
            <Button
              label={t("detail.notesExport")}
              icon="share-outline"
              variant="ghost"
              onPress={onExportNotes}
            />
          ) : null}
          {onOpenHistory !== undefined ? (
            <Button
              label={t("history.title")}
              icon="time-outline"
              variant="ghost"
              onPress={onOpenHistory}
            />
          ) : null}
        </View>
      ) : null}

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

      {/* 正文：查看 / 编辑双模式。onSaveNotes 未接线时保持只读（兼容旧调用方） */}
      {editingNotes ? (
        <>
          <SectionHeader
            title={t("detail.notes")}
            trailing={
              <AppText variant="caption" tone="tertiary" lines={1}>
                {t("detail.notesWords", { n: draftCount.words })}
              </AppText>
            }
          />
          <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <TextInput
              multiline
              autoFocus
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder={t("detail.notesPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              textAlignVertical="top"
              accessibilityLabel={t("detail.notes")}
              style={[styles.notesInput, { color: colors.text }]}
            />
          </View>
          <View style={styles.notesToolbar}>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {t("detail.notesReading", { n: draftCount.readingMinutes })}
            </AppText>
            <View style={styles.notesActions}>
              <Button
                label={t("common.cancel")}
                variant="ghost"
                size="sm"
                disabled={savingNotes}
                onPress={() => void cancelEditNotes()}
              />
              <Button
                label={savingNotes ? t("common.saving") : t("common.save")}
                variant="primary"
                size="sm"
                disabled={savingNotes}
                onPress={() => void saveNotes()}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <SectionHeader
            title={t("detail.notes")}
            trailing={
              <View style={styles.notesHeaderTrailing}>
                {task.notes.length > 0 ? (
                  <AppText variant="caption" tone="tertiary" lines={1}>
                    {t("detail.notesWords", { n: notesCount.words })} ·{" "}
                    {t("detail.notesReading", { n: notesCount.readingMinutes })}
                  </AppText>
                ) : null}
                {onSaveNotes !== undefined ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("detail.notesEditA11y")}
                    onPress={startEditNotes}
                    hitSlop={8}
                    style={({ pressed }) => [styles.notesEditHit, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <AppText variant="caption" color={colors.primary} lines={1}>
                      {t("common.edit")}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            }
          />
          {task.notes.length > 0 ? (
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MarkdownView source={task.notes} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("detail.notesEditA11y")}
              disabled={onSaveNotes === undefined}
              onPress={startEditNotes}
              style={({ pressed }) => [
                styles.notesCard,
                styles.notesEmpty,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppText variant="label" tone="tertiary" lines={2} align="center">
                {onSaveNotes !== undefined ? t("detail.notesEmptyHint") : t("detail.notesEmpty")}
              </AppText>
            </Pressable>
          )}
        </>
      )}

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
  notesHeaderTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  notesEditHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: hit.min,
    paddingHorizontal: space.xs,
    justifyContent: "center",
  },
  notesInput: {
    minHeight: 180,
    maxHeight: 520,
    fontSize: 16,
    lineHeight: 26,
    padding: 0,
  },
  notesToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.xs,
  },
  notesActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  notesEmpty: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
  },
});

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Task } from "@gtd/core";

import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { RowActions, type ActionItem } from "./RowActions";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { radius, space } from "../theme/tokens";

export interface KanbanColumn {
  key: string;
  title: string;
  tasks: Task[];
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  now: number;
  onPressTask: (task: Task) => void;
  actions?:
    | ActionItem[]
    | { key: string; label: string; danger?: boolean; onSelect: (task: Task) => void }[];
}

/**
 * 看板：横向滚动的定宽列（272px），列头固定，列内纵向滚动。
 * 列宽与卡片高度均由内容上限约束，不会因文字长度改变列宽。
 */
export function KanbanBoard({ columns, now, onPressTask, actions }: KanbanBoardProps) {
  const colors = useTheme();

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.board}
      showsHorizontalScrollIndicator={false}
    >
      {columns.map((column) => (
        <View
          key={column.key}
          accessibilityLabel={`${column.title}: ${column.tasks.length}`}
          style={[styles.column, { backgroundColor: colors.surfaceMuted }]}
        >
          <View style={styles.columnHead}>
            <AppText variant="label" weight="700" lines={1} style={styles.columnTitle}>
              {column.title}
            </AppText>
            <View style={[styles.countPill, { backgroundColor: colors.surface }]}>
              <AppText variant="caption" tone="secondary" lines={1}>
                {column.tasks.length}
              </AppText>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {column.tasks.map((task) => (
              <View key={task.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("task.a11yOpen", { title: task.title })}
                  onPress={() => onPressTask(task)}
                  style={({ pressed }) => [styles.cardBody, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <AppText variant="body" lines={2}>
                    {task.title}
                  </AppText>
                  <View style={styles.cardMeta}>
                    <PriorityBadge priority={task.priority} />
                    <DueDateChip task={task} now={now} />
                  </View>
                </Pressable>
                {actions !== undefined && actions.length > 0 ? (
                  <View style={styles.cardActions}>
                    <RowActions
                      actions={actions.map((action) => ({
                        key: action.key,
                        label: action.label,
                        danger: action.danger,
                        onSelect: () => (action.onSelect as (task: Task) => void)(task),
                      }))}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            {column.tasks.length === 0 ? (
              <AppText variant="caption" tone="tertiary" align="center" lines={1} style={styles.empty}>
                —
              </AppText>
            ) : null}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  column: {
    width: 272,
    flexShrink: 0,
    borderRadius: radius.md,
    padding: space.sm,
  },
  columnHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  columnTitle: {
    flex: 1,
    minWidth: 0,
  },
  countPill: {
    minWidth: 22,
    height: 20,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
  cards: {
    paddingBottom: space.xs,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    padding: space.md,
    gap: space.xs,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    overflow: "hidden",
  },
  cardActions: {
    paddingTop: space.xs,
    paddingRight: space.xxs,
  },
  empty: {
    paddingVertical: space.lg,
  },
});

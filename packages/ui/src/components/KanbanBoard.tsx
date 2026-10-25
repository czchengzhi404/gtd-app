import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Task } from "@gtd/core";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { RowActions } from "./RowActions";
import { radius, spacing } from "../tokens";

export interface KanbanColumn {
  key: string;
  title: string;
  tasks: Task[];
}

export interface KanbanCardAction {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (task: Task) => void;
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  now: number;
  onPressTask: (task: Task) => void;
  /** 卡片更多操作（删除/重命名）；不传则不渲染入口 */
  actions?: KanbanCardAction[];
}

/**
 * 看板视图：GTD 四状态分列（收集箱/下一步/等待中/将来·也许）。
 * 列内点卡片进详情理清（拖拽跨列依赖手势库，v1 用详情页状态流转承担）。
 */
export function KanbanBoard({ columns, now, onPressTask, actions }: KanbanBoardProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
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
          style={[styles.column, { backgroundColor: colors.surface }]}
        >
          <View style={styles.columnHeader}>
            <Text maxFontSizeMultiplier={1.2} style={[styles.columnTitle, { color: colors.text }]}>{column.title}</Text>
            <Text maxFontSizeMultiplier={1.2} style={[styles.count, { color: colors.textSecondary }]}>{column.tasks.length}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {column.tasks.map((task) => (
              <View key={task.id} style={[styles.cardWrap, { backgroundColor: colors.bg }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("task.a11yOpen", { title: task.title })}
                  onPress={() => onPressTask(task)}
                  style={({ pressed }) => [styles.card, focus, pressed && { opacity: 0.7 }]}
                >
                  <Text maxFontSizeMultiplier={1.2} style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                    {task.title}
                  </Text>
                  <View style={styles.cardMeta}>
                    <PriorityBadge priority={task.priority} />
                    <DueDateChip task={task} now={now} />
                  </View>
                </Pressable>
                {actions !== undefined && actions.length > 0 ? (
                  <View style={styles.cardActions}>
                    <RowActions
                      accessibilityLabel={t("common.moreActions")}
                      actions={actions.map((action) => ({
                        key: action.key,
                        label: action.label,
                        danger: action.danger,
                        onSelect: () => action.onSelect(task),
                      }))}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            {column.tasks.length === 0 ? (
              <Text maxFontSizeMultiplier={1.2} style={[styles.empty, { color: colors.textSecondary }]}>—</Text>
            ) : null}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  column: {
    width: 280,
    flexShrink: 0,
    maxHeight: "100%",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  columnTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  count: {
    fontSize: 13,
  },
  cardWrap: {
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  card: {
    flex: 1,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    gap: 4,
  },
  cardActions: {
    alignSelf: "center",
    paddingRight: 2,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardMeta: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.lg,
    fontSize: 14,
  },
});

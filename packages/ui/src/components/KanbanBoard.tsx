import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Task } from "@gtd/core";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { radius, spacing } from "../tokens";

export interface KanbanColumn {
  key: string;
  title: string;
  tasks: Task[];
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  now: number;
  onPressTask: (task: Task) => void;
}

/**
 * 看板视图：GTD 四状态分列（收集箱/下一步/等待中/将来·也许）。
 * 列内点卡片进详情理清（拖拽跨列依赖手势库，v1 用详情页状态流转承担）。
 */
export function KanbanBoard({ columns, now, onPressTask }: KanbanBoardProps) {
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
          accessibilityLabel={`${column.title}，${column.tasks.length} 个任务`}
          style={[styles.column, { backgroundColor: colors.surface }]}
        >
          <View style={styles.columnHeader}>
            <Text style={[styles.columnTitle, { color: colors.text }]}>{column.title}</Text>
            <Text style={[styles.count, { color: colors.textSecondary }]}>{column.tasks.length}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {column.tasks.map((task) => (
              <Pressable
                key={task.id}
                accessibilityRole="button"
                accessibilityLabel={`打开任务：${task.title}`}
                onPress={() => onPressTask(task)}
                style={({ pressed }) => [
                  styles.card,
                  focus,
                  { backgroundColor: colors.bg, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                  {task.title}
                </Text>
                <View style={styles.cardMeta}>
                  <PriorityBadge priority={task.priority} />
                  <DueDateChip task={task} now={now} />
                </View>
              </Pressable>
            ))}
            {column.tasks.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>空</Text>
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
  card: {
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    gap: 4,
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

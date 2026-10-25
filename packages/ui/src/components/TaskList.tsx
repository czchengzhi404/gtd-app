import { FlatList, StyleSheet, View, type ListRenderItemInfo } from "react-native";
import type { Task } from "@gtd/core";
import { EmptyState } from "./EmptyState";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { Chip } from "./Chip";
import { TaskRow } from "./TaskRow";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { spacing } from "../tokens";

export interface TaskRowAction {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (task: Task) => void;
}

export interface TaskListProps {
  tasks: Task[];
  now: number;
  /** 状态名 → 显示文本（上下文名由调用方解析后传入） */
  contextNameById?: Record<string, string>;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  /** 行尾更多操作（删除/重命名）；不传则不渲染入口 */
  actions?: TaskRowAction[];
  emptyTitle?: string;
  emptyHint?: string;
}

/** 任务列表（FlatList 虚拟化；行内渲染到期/优先级/情境元信息） */
export function TaskList({
  tasks,
  now,
  contextNameById = {},
  onToggleTask,
  onPressTask,
  actions,
  emptyTitle,
  emptyHint,
}: TaskListProps) {
  const colors = useTheme();
  const renderItem = ({ item }: ListRenderItemInfo<Task>) => (
    <TaskRow
      title={item.title}
      done={item.status === "done"}
      onToggle={() => onToggleTask(item)}
      onPress={() => onPressTask(item)}
      actions={actions?.map((action) => ({
        key: action.key,
        label: action.label,
        danger: action.danger,
        onSelect: () => action.onSelect(item),
      }))}
      meta={
        <View style={styles.meta}>
          <PriorityBadge priority={item.priority} />
          <DueDateChip task={item} now={now} />
          {item.contextIds.map((id) => {
            const name = contextNameById[id];
            return name ? <Chip key={id} label={name} /> : null;
          })}
        </View>
      }
    />
  );
  return (
    <FlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListEmptyComponent={
        <EmptyState
          title={emptyTitle ?? t("empty.list")}
          hint={emptyHint ?? t("empty.listHint")}
        />
      }
      contentContainerStyle={tasks.length === 0 ? styles.emptyContent : undefined}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.bg }}
    />
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyContent: {
    flex: 1,
  },
});

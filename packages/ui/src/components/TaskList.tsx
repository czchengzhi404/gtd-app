import { FlatList, StyleSheet, View, type ListRenderItemInfo } from "react-native";
import type { Task } from "@gtd/core";

import { EmptyState } from "./EmptyState";
import { TaskRow } from "./TaskRow";
import { Chip } from "./Chip";
import { PriorityBadge } from "./PriorityBadge";
import { DueDateChip } from "./DueDateChip";
import { Divider } from "../theme/primitives";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { radius, space } from "../theme/tokens";

export interface TaskRowAction {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: (task: Task) => void;
}

export interface TaskListProps {
  tasks: Task[];
  now: number;
  /** 情境 id → 名称 */
  contextNameById?: Record<string, string>;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  /** 行尾更多操作 */
  actions?: TaskRowAction[];
  /** 桌面端原生右键菜单（返回 true = 已处理） */
  onContextMenuTask?: (task: Task, position: { x: number; y: number }) => Promise<boolean>;
  emptyTitle?: string;
  emptyHint?: string;
  /** 卡片化容器（列表页默认开；嵌在其他卡片内时可关） */
  carded?: boolean;
}

/**
 * 任务列表：单卡片 + 细分隔线（比逐行卡片更紧凑、滚动更省空间）。
 * 空态不套卡片，保持留白。
 */
export function TaskList({
  tasks,
  now,
  contextNameById = {},
  onToggleTask,
  onPressTask,
  actions,
  onContextMenuTask,
  emptyTitle,
  emptyHint,
  carded = true,
}: TaskListProps) {
  const colors = useTheme();

  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle ?? t("empty.list")} hint={emptyHint ?? t("empty.listHint")} />;
  }

  const renderItem = ({ item }: ListRenderItemInfo<Task>) => (
    <TaskRow
      title={item.title}
      done={item.status === "done"}
      onToggle={() => onToggleTask(item)}
      onPress={() => onPressTask(item)}
      onContextMenu={
        onContextMenuTask !== undefined
          ? async (position) => {
              const handled = await onContextMenuTask(item, position);
              if (!handled) onPressTask(item);
              return handled;
            }
          : undefined
      }
      actions={actions?.map((action) => ({
        key: action.key,
        label: action.label,
        danger: action.danger,
        onSelect: () => action.onSelect(item),
      }))}
      meta={
        <>
          <PriorityBadge priority={item.priority} />
          <DueDateChip task={item} now={now} />
          {item.contextIds.slice(0, 2).map((id) => {
            const name = contextNameById[id];
            return name !== undefined ? <Chip key={id} label={name} /> : null;
          })}
        </>
      }
    />
  );

  return (
    <FlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <Divider inset={space.lg} />}
      keyboardShouldPersistTaps="handled"
      style={[
        styles.list,
        carded
          ? {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              borderWidth: StyleSheet.hairlineWidth,
            }
          : undefined,
      ]}
      contentContainerStyle={carded ? styles.content : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
  },
  content: {
    overflow: "hidden",
    borderRadius: radius.md,
  },
});

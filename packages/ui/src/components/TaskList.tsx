import { useEffect } from "react";
import { FlatList, LayoutAnimation, Platform, StyleSheet, UIManager, View, type ListRenderItemInfo } from "react-native";
import type { Task } from "@gtd/core";
import { startOfDay } from "@gtd/core";

import { EmptyState, type EmptyStateAction, type EmptyStateProps } from "./EmptyState";
import { TaskRow } from "./TaskRow";
import { Chip } from "./Chip";
import { PriorityBadge } from "./PriorityBadge";
import { DueDateChip } from "./DueDateChip";
import { Divider } from "../theme/primitives";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { hit, radius, space } from "../theme/tokens";

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
  /** 空态主行动（透传 EmptyState.action） */
  emptyAction?: EmptyStateAction;
  /** 空态插画变体（透传 EmptyState.illustration） */
  emptyIllustration?: EmptyStateProps["illustration"];
  /** 卡片化容器（列表页默认开；嵌在其他卡片内时可关） */
  carded?: boolean;
  /** 多选模式 */
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (task: Task) => void;
  /** 长按进入多选 */
  onEnterSelection?: (task: Task) => void;
  /** 左滑动作（如完成） */
  onSwipeLeftTask?: (task: Task) => void;
  /** 右滑动作（如删除/延后） */
  onSwipeRightTask?: (task: Task) => void;
  /** 拖拽手柄松手：把任务移到目标下标（父级负责落库 orderKey） */
  onReorderTask?: (task: Task, toIndex: number) => void;
  /** 排序模式：显示拖拽手柄（配合 onReorderTask） */
  reorderMode?: boolean;
  /** 列表顶部/底部插槽 */
  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
}

/** 与 TaskRow 行高（hit.row）一致，用于把拖拽位移换算成行数 */
const ROW_STEP = hit.row;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  emptyAction,
  emptyIllustration,
  carded = true,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onEnterSelection,
  onSwipeLeftTask,
  onSwipeRightTask,
  onReorderTask,
  reorderMode = false,
  header,
  footer,
}: TaskListProps) {
  const colors = useTheme();

  // 原生端：列表增删（完成/删除/恢复）时 220ms 收拢动画；
  // web 走 react-native-web 自身过渡，不启用（避免与 DOM diff 打架）
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (
      Platform.OS === "android" &&
      typeof UIManager.setLayoutAnimationEnabledExperimental === "function"
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY },
    });
  }, [tasks.length]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? t("empty.list")}
        hint={emptyHint ?? t("empty.listHint")}
        action={emptyAction}
        illustration={emptyIllustration}
      />
    );
  }

  const dayStart = startOfDay(now);

  /** 状态竖条：逾期 > 今天到期 > 等待中（已完成不显示） */
  const accentOf = (task: Task): string | undefined => {
    if (task.status === "done") return undefined;
    if (task.dueAt !== null && task.dueAt < now) return colors.danger;
    if (task.dueAt !== null && task.dueAt >= dayStart && task.dueAt < dayStart + DAY_MS) {
      return colors.warning;
    }
    if (task.status === "waiting") return colors.textTertiary;
    return undefined;
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<Task>) => (
    <TaskRow
      title={item.title}
      done={item.status === "done"}
      onToggle={() => onToggleTask(item)}
      onPress={() => onPressTask(item)}
      onLongPress={onEnterSelection !== undefined ? () => onEnterSelection(item) : undefined}
      onContextMenu={
        onContextMenuTask !== undefined
          ? async (position) => {
              const handled = await onContextMenuTask(item, position);
              if (!handled) onPressTask(item);
              return handled;
            }
          : undefined
      }
      selectionMode={selectionMode}
      selected={selectedIds?.has(item.id) ?? false}
      onSelect={() => onToggleSelect?.(item)}
      onSwipeLeft={onSwipeLeftTask !== undefined ? () => onSwipeLeftTask(item) : undefined}
      onSwipeRight={onSwipeRightTask !== undefined ? () => onSwipeRightTask(item) : undefined}
      onDragEnd={
        onReorderTask !== undefined && !selectionMode
          ? (dy) => {
              const offset = Math.round(dy / ROW_STEP);
              if (offset === 0) return;
              const target = Math.min(tasks.length - 1, Math.max(0, index + offset));
              if (target !== index) onReorderTask(item, target);
            }
          : undefined
      }
      reorderMode={reorderMode}
      accent={accentOf(item)}
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
          {item.tags.slice(0, 2).map((tag) => (
            <Chip key={tag} label={tag} prefix="#" />
          ))}
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
      ListHeaderComponent={header ?? null}
      ListFooterComponent={footer ?? null}
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
    maxWidth: 880,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
  },
  content: {
    overflow: "hidden",
    borderRadius: radius.md,
  },
});

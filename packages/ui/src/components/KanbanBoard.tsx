import { useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import type { Task, TaskStatusInput } from "@gtd/core";
import { exceedsDragThreshold, resolveDrop, type ColumnRect } from "@gtd/core";

import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { RowActions, type ActionItem } from "./RowActions";
import { DueDateChip } from "./DueDateChip";
import { PriorityBadge } from "./PriorityBadge";
import { elevation, radius, space } from "../theme/tokens";

export interface KanbanColumn {
  key: string;
  title: string;
  /** 该列对应的任务状态（done 列不参与拖拽） */
  status: TaskStatusInput | null;
  tasks: Task[];
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  now: number;
  onPressTask: (task: Task) => void;
  /** 拖到另一列：调用方执行 task.moveStatus */
  onMoveTask?: (task: Task, status: TaskStatusInput) => void;
  actions?:
    | ActionItem[]
    | { key: string; label: string; danger?: boolean; onSelect: (task: Task) => void }[];
}

const COLUMN_WIDTH = 272;
const COLUMN_GAP = 12;
const BOARD_PADDING = 16;

/**
 * 看板：横向滚动列 + 卡片跨列拖拽。
 *
 * 拖拽实现要点：
 * - 用 PanResponder 跟踪卡片中心点，松手时按列区间命中判定目标列（纯函数 resolveDrop）
 * - 位移超过 6px 才进入拖拽态，避免点按误触
 * - 拖拽中的卡片绝对定位跟随手指，原位置保留占位（不引起列表跳动）
 * - 未提供 onMoveTask 时自动降级为仅点击（只读看板）
 */
export function KanbanBoard({
  columns,
  now,
  onPressTask,
  onMoveTask,
  actions,
}: KanbanBoardProps) {
  const colors = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const columnOffsets = useRef<Record<string, number>>({});
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragSourceRef = useRef<{ task: Task; columnKey: string } | null>(null);

  const columnRects = useMemo<ColumnRect[]>(
    () =>
      columns.map((column, index) => ({
        key: column.key,
        x: BOARD_PADDING + index * (COLUMN_WIDTH + COLUMN_GAP),
        width: COLUMN_WIDTH,
      })),
    [columns],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          dragSourceRef.current !== null && exceedsDragThreshold(gesture.dx, gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          const source = dragSourceRef.current;
          if (source === null) return;
          pan.setValue({ x: gesture.dx, y: gesture.dy });
          const origin = columnOffsets.current[source.columnKey] ?? 0;
          const centerX = origin + COLUMN_WIDTH / 2 + gesture.dx;
          setHoverColumn(resolveDrop(source.columnKey, centerX, columnRects));
        },
        onPanResponderRelease: (_event, gesture) => {
          const source = dragSourceRef.current;
          dragSourceRef.current = null;
          setDragTask(null);
          setHoverColumn(null);
          pan.setValue({ x: 0, y: 0 });
          if (source === null) return;
          const origin = columnOffsets.current[source.columnKey] ?? 0;
          const centerX = origin + COLUMN_WIDTH / 2 + gesture.dx;
          const targetKey = resolveDrop(source.columnKey, centerX, columnRects);
          if (targetKey === null) return;
          const target = columns.find((column) => column.key === targetKey);
          if (target?.status === null || target?.status === undefined) return;
          onMoveTask?.(source.task, target.status);
        },
        onPanResponderTerminate: () => {
          dragSourceRef.current = null;
          setDragTask(null);
          setHoverColumn(null);
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [columnRects, columns, onMoveTask, pan],
  );

  const startDrag = (task: Task, columnKey: string) => {
    if (onMoveTask === undefined) return;
    dragSourceRef.current = { task, columnKey };
    setDragTask(task);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        contentContainerStyle={styles.board}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={dragTask === null}
      >
        {columns.map((column) => {
          const droppable = column.status !== null && hoverColumn === column.key;
          return (
            <View
              key={column.key}
              onLayout={(event) => {
                columnOffsets.current[column.key] = event.nativeEvent.layout.x;
              }}
              accessibilityLabel={`${column.title}: ${column.tasks.length}`}
              style={[
                styles.column,
                {
                  backgroundColor: droppable ? colors.primaryMuted : colors.surfaceMuted,
                  borderColor: droppable ? colors.primary : "transparent",
                },
              ]}
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

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.cards}
                scrollEnabled={dragTask === null}
              >
                {column.tasks.map((task) => {
                  const dragging = dragTask?.id === task.id;
                  return (
                    <View
                      key={task.id}
                      style={[
                        styles.card,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: dragging ? 0.35 : 1,
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("task.a11yOpen", { title: task.title })}
                        onPress={() => onPressTask(task)}
                        onLongPress={() => startDrag(task, column.key)}
                        delayLongPress={220}
                        {...(onMoveTask !== undefined ? responder.panHandlers : {})}
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
                  );
                })}
                {column.tasks.length === 0 ? (
                  <AppText variant="caption" tone="tertiary" align="center" lines={1} style={styles.empty}>
                    —
                  </AppText>
                ) : null}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {/* 拖拽中的浮层卡片：跟随手指，不参与布局 */}
      {dragTask !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragGhost,
            elevation.float,
            {
              backgroundColor: colors.surface,
              borderColor: colors.primary,
              width: Math.min(COLUMN_WIDTH - 16, screenWidth - 64),
              transform: pan.getTranslateTransform(),
            },
          ]}
        >
          <AppText variant="body" lines={2}>
            {dragTask.title}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    paddingHorizontal: BOARD_PADDING,
    paddingBottom: space.xl,
    gap: COLUMN_GAP,
  },
  column: {
    width: COLUMN_WIDTH,
    flexShrink: 0,
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: 1.5,
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
  dragGhost: {
    position: "absolute",
    top: 120,
    left: 16,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    zIndex: 1000,
  },
});

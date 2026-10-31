import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { RowActions, type ActionItem } from "./RowActions";
import { hit, radius, space } from "../theme/tokens";

export interface TaskRowProps {
  title: string;
  done?: boolean;
  onToggle?: () => void;
  onPress?: () => void;
  meta?: ReactNode;
  actions?: ActionItem[];
  onLongPress?: () => void;
  onContextMenu?: (position: { x: number; y: number }) => Promise<boolean>;
  /** 多选模式：显示勾选框、点击即选中 */
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** 左滑（手指向左）动作，如"完成"；提供时启用滑动 */
  onSwipeLeft?: () => void;
  /** 右滑（手指向右）动作，如"删除" */
  onSwipeRight?: () => void;
  /** 提供时支持拖拽排序；松手回调位移（父级据此换算目标位置） */
  onDragEnd?: (dy: number) => void;
  /** 排序模式：仅此模式显示拖拽手柄（常驻把手会挤占行宽、徒增视觉噪音） */
  reorderMode?: boolean;
  /** 状态色竖条（逾期=danger / 今天到期=warning / 等待中=neutral），提供时渲染在行左缘 */
  accent?: string;
}

const SWIPE_TRIGGER = 72;

/**
 * 任务行（支持多选、滑动动作、拖拽手柄）。
 *
 * 交互纪律：
 * - 滑动仅在提供 onSwipeLeft/Right 时启用，阈值 72px，松手吸附
 * - 拖拽手柄独立于整行点击，避免与滚动/点击冲突
 * - 所有手势都不改变行高，避免列表跳动
 */
export function TaskRow({
  title,
  done = false,
  onToggle,
  onPress,
  meta,
  actions,
  onLongPress,
  onContextMenu,
  selectionMode = false,
  selected = false,
  onSelect,
  onSwipeLeft,
  onSwipeRight,
  onDragEnd,
  reorderMode = false,
  accent,
}: TaskRowProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const translateX = useRef(new Animated.Value(0)).current;

  const swipeEnabled =
    (onSwipeLeft !== undefined || onSwipeRight !== undefined) && !selectionMode && !reorderMode;

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          // 只允许提供动作的方向
          if (g.dx > 0 && onSwipeRight === undefined) return;
          if (g.dx < 0 && onSwipeLeft === undefined) return;
          translateX.setValue(g.dx);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE_TRIGGER && onSwipeLeft !== undefined) {
            Animated.timing(translateX, { toValue: -400, duration: 180, useNativeDriver: true }).start(() => {
              translateX.setValue(0);
              onSwipeLeft();
            });
            return;
          }
          if (g.dx >= SWIPE_TRIGGER && onSwipeRight !== undefined) {
            Animated.timing(translateX, { toValue: 400, duration: 180, useNativeDriver: true }).start(() => {
              translateX.setValue(0);
              onSwipeRight();
            });
            return;
          }
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [onSwipeLeft, onSwipeRight, translateX],
  );

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderRelease: (_e, g) => onDragEnd?.(g.dy),
      }),
    [onDragEnd],
  );

  const webContextProps =
    onContextMenu !== undefined
      ? {
          onContextMenu: (event: { nativeEvent?: { pageX?: number; pageY?: number }; preventDefault?: () => void }) => {
            event.preventDefault?.();
            void onContextMenu({
              x: event.nativeEvent?.pageX ?? 0,
              y: event.nativeEvent?.pageY ?? 0,
            });
          },
        }
      : {};

  return (
    <Animated.View
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.primaryMuted : colors.surface,
          transform: swipeEnabled ? [{ translateX }] : undefined,
          borderLeftWidth: accent !== undefined ? 3 : 0,
          borderLeftColor: accent,
        },
      ]}
      {...(webContextProps as object)}
      {...(swipeEnabled ? swipeResponder.panHandlers : {})}
    >
      {/* 多选勾选框 / 完成勾选框 */}
      {selectionMode ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={t("bulk.selectOne", { title })}
          onPress={onSelect}
          hitSlop={4}
          style={styles.checkHit}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: selected ? colors.primary : colors.borderStrong,
                backgroundColor: selected ? colors.primary : "transparent",
              },
            ]}
          >
            {selected ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={t(done ? "task.a11yCompleted" : "task.a11yMarkComplete", { title })}
          onPress={onToggle}
          hitSlop={4}
          style={({ pressed }) => [styles.checkHit, focus, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: done ? colors.primary : colors.borderStrong,
                backgroundColor: done ? colors.primary : "transparent",
              },
            ]}
          >
            {done ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
          </View>
        </Pressable>
      )}

      {onDragEnd !== undefined && reorderMode ? (
        <View {...dragResponder.panHandlers} style={styles.grip} accessible accessibilityLabel={t("task.dragHandle")}>
          <Ionicons name="reorder-three" size={18} color={colors.textTertiary} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("task.a11yOpen", { title })}
        onPress={selectionMode ? onSelect : onPress}
        onLongPress={onLongPress}
        delayLongPress={250}
        style={({ pressed }) => [styles.body, focus, { opacity: pressed ? 0.6 : 1 }]}
      >
        <AppText
          variant="body"
          lines={2}
          style={done ? styles.titleDone : undefined}
          color={done ? colors.textTertiary : colors.text}
        >
          {title}
        </AppText>
        {meta !== undefined ? <View style={styles.meta}>{meta}</View> : null}
      </Pressable>

      {!selectionMode && actions !== undefined && actions.length > 0 ? (
        <RowActions actions={actions} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: hit.row,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.xs,
    paddingRight: space.xs,
    gap: space.xxs,
  },
  checkHit: {
    width: hit.min,
    height: hit.row,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  grip: {
    width: 28,
    height: hit.row,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.6,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.sm,
    gap: 3,
    borderRadius: radius.sm,
  },
  titleDone: {
    textDecorationLine: "line-through",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    overflow: "hidden",
  },
});

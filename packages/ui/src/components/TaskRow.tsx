import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  /** 整行点击（打开详情） */
  onPress?: () => void;
  /** 行内元信息（到期/优先级/情境），渲染在标题下方 */
  meta?: ReactNode;
  /** 行尾更多操作（删除/重命名） */
  actions?: ActionItem[];
  onLongPress?: () => void;
  /**
   * 桌面端右键：返回 true 表示已由原生菜单处理。
   * web 端挂到外层 View 的 onContextMenu（RNW 透传 DOM 事件）。
   */
  onContextMenu?: (position: { x: number; y: number }) => Promise<boolean>;
}

/**
 * 任务行。
 * 布局纪律：最小高度固定（hit.row）、标题最多 2 行、元信息行不换行裁切，
 * 因此无论文本多长/系统字体如何设置，行高都可预测、不会相互挤压。
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
}: TaskRowProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);

  // RNW 会把 onContextMenu 透传到 DOM；native 上该 prop 被忽略
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
    <View style={styles.row} {...(webContextProps as object)}>
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("task.a11yOpen", { title })}
        onPress={onPress}
        onLongPress={onLongPress}
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

      {actions !== undefined && actions.length > 0 ? <RowActions actions={actions} /> : null}
    </View>
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

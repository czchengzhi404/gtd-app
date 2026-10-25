import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { minTouchTarget, radius, spacing } from "../tokens";
import { RowActions } from "./RowActions";

export interface TaskRowProps {
  title: string;
  done?: boolean;
  onToggle?: () => void;
  /** 整行点击（打开详情）；与 checkbox 点击分离 */
  onPress?: () => void;
  /** 行内元信息（到期/优先级/情境 chips），渲染在标题下 */
  meta?: ReactNode;
  /** 行尾更多操作（删除/重命名等）；不传则不渲染入口 */
  actions?: { key: string; label: string; danger?: boolean; onSelect: () => void }[];
  /** 长按整行（移动端快捷删除入口） */
  onLongPress?: () => void;
}

/**
 * 任务行。ui-ux-pro-max 约束：触控目标 ≥44px；checkbox 与整行分离为两个
 * 可达性目标（checkbox=checkbox role，行=button role）；按压反馈用透明度。
 * actions 提供时行尾渲染 ⋯ 更多操作面板。
 */
export function TaskRow({ title, done = false, onToggle, onPress, meta, actions, onLongPress }: TaskRowProps) {
  const colors = useTheme();
  return (
    <View
      style={[styles.rowWrap, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={t(done ? "task.a11yCompleted" : "task.a11yMarkComplete", { title })}
        onPress={onToggle}
        hitSlop={8}
        style={styles.checkboxHit}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: done ? colors.primary : colors.border,
              backgroundColor: done ? colors.primary : "transparent",
            },
          ]}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("task.a11yOpen", { title })}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.body, pressed && { opacity: 0.6 }]}
      >
        <Text maxFontSizeMultiplier={1.2}
          style={[styles.title, { color: colors.text }, done && styles.titleDone]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {meta ? <View style={styles.meta}>{meta}</View> : null}
      </Pressable>
      {actions !== undefined && actions.length > 0 ? (
        <RowActions actions={actions} accessibilityLabel={t("common.moreActions")} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkboxHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
  },
  body: {
    flex: 1,
    paddingVertical: 2,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
  },
  titleDone: {
    textDecorationLine: "line-through",
    opacity: 0.55,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
});

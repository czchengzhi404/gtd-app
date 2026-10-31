import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Button } from "../theme/primitives";
import { space } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: IoniconName;
}

export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: IoniconName;
  /**
   * 插画变体：主图标 + 右上角小点缀（primary 色），给各屏一个专属视觉身份。
   * 提供后覆盖 icon 参数；未提供时保持原样（单一 ✓✓ 图标）。
   */
  illustration?: "inbox" | "today" | "focus" | "done" | "trash";
  /** 空态主行动：给了就渲染按钮，让空态可操作而不是纯提示 */
  action?: EmptyStateAction;
  /** 次行动（如"去收集箱看看"） */
  secondaryAction?: EmptyStateAction;
}

const ILLUSTRATIONS: Record<
  NonNullable<EmptyStateProps["illustration"]>,
  { icon: IoniconName; accent: IoniconName }
> = {
  inbox: { icon: "file-tray-outline", accent: "add-circle" },
  today: { icon: "calendar-outline", accent: "alarm-outline" },
  focus: { icon: "timer-outline", accent: "star" },
  done: { icon: "checkmark-done-outline", accent: "trophy-outline" },
  trash: { icon: "trash-outline", accent: "refresh" },
};

/** 空态：垂直居中、留白充足，带可选插画变体与行动按钮 */
export function EmptyState({
  title,
  hint,
  icon = "checkmark-done-outline",
  illustration,
  action,
  secondaryAction,
}: EmptyStateProps) {
  const colors = useTheme();
  const art = illustration !== undefined ? ILLUSTRATIONS[illustration] : { icon, accent: null };

  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${title}。${hint ?? ""}`}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name={art.icon} size={26} color={colors.textTertiary} />
        {art.accent !== null ? (
          <View style={[styles.accentWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name={art.accent} size={12} color={colors.primary} />
          </View>
        ) : null}
      </View>
      <AppText variant="bodyStrong" lines={2} align="center" style={styles.title}>
        {title}
      </AppText>
      {hint !== undefined ? (
        <AppText variant="label" tone="tertiary" lines={3} align="center" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
      {action !== undefined ? (
        <View style={styles.actions}>
          <Button
            label={action.label}
            icon={action.icon}
            variant="primary"
            onPress={action.onPress}
          />
          {secondaryAction !== undefined ? (
            <Button
              label={secondaryAction.label}
              icon={secondaryAction.icon}
              variant="ghost"
              onPress={secondaryAction.onPress}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxxl,
    paddingVertical: space.xxl,
    gap: space.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
    // 点缀锚点
    position: "relative",
  },
  accentWrap: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  title: {
    maxWidth: 260,
  },
  hint: {
    maxWidth: 280,
  },
  actions: {
    alignItems: "center",
    gap: space.xs,
    paddingTop: space.xs,
  },
});

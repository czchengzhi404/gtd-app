import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "./AppText";
import { elevation, hit, radius, space } from "./tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/* ---------------- Button ---------------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: IoniconName;
  /** 撑满父容器宽度 */
  block?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  block = false,
  accessibilityHint,
}: ButtonProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const inactive = disabled || loading;

  const bg = {
    primary: colors.primary,
    secondary: colors.surfaceMuted,
    ghost: "transparent",
    danger: colors.dangerMuted,
  }[variant];
  const fg = {
    primary: colors.onPrimary,
    secondary: colors.text,
    ghost: colors.primary,
    danger: colors.danger,
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        focus,
        {
          minHeight: size === "md" ? hit.button : hit.buttonSm,
          paddingHorizontal: size === "md" ? space.lg : space.md,
          backgroundColor: bg,
          opacity: inactive ? 0.45 : pressed ? 0.8 : 1,
          alignSelf: block ? "stretch" : "flex-start",
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.buttonContent}>
          {icon !== undefined ? <Ionicons name={icon} size={17} color={fg} /> : null}
          <AppText variant={size === "md" ? "bodyStrong" : "label"} weight="600" color={fg} lines={1}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- IconButton ---------------- */

export interface IconButtonProps {
  icon: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: "default" | "danger";
  size?: number;
  filled?: boolean;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = "default",
  size = 20,
  filled = false,
}: IconButtonProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const fg = tone === "danger" ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        focus,
        {
          backgroundColor: filled ? colors.surfaceMuted : "transparent",
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={size} color={fg} />
    </Pressable>
  );
}

/* ---------------- Card ---------------- */

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** 紧凑内边距（列表卡片） */
  compact?: boolean;
  style?: ViewStyle;
}

export function Card({ children, onPress, accessibilityLabel, compact = false, style }: CardProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.md);
  const padding = compact ? space.md : space.lg;

  if (onPress === undefined) {
    return (
      <View
        style={[
          styles.card,
          elevation.card,
          { backgroundColor: colors.surface, borderColor: colors.border, padding },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        focus,
        elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          padding,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ---------------- Divider ---------------- */

export function Divider({
  inset = 0,
  style,
}: {
  inset?: number;
  /** 外部间距（如分组内的上下留白） */
  style?: { marginVertical?: number; marginHorizontal?: number };
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginLeft: inset,
        },
        style,
      ]}
    />
  );
}

/* ---------------- Spinner ---------------- */

export function Spinner({ label }: { label?: string }) {
  const colors = useTheme();
  return (
    <View style={styles.spinner}>
      <ActivityIndicator color={colors.primary} />
      {label !== undefined ? (
        <AppText variant="label" tone="secondary" lines={2} align="center">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  iconButton: {
    width: hit.min,
    height: hit.min,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spinner: {
    padding: space.xxl,
    alignItems: "center",
    gap: space.md,
  },
});

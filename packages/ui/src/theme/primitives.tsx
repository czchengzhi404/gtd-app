import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { t } from "../i18n";
import { AppText } from "./AppText";
import { elevation, hit, motion, radius, space } from "./tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/* ---------------- Button ---------------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";
/** 语义色：default=正文/常态，primary=品牌色，danger=危险操作 */
export type ButtonTone = "default" | "primary" | "danger";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** v2：语义色（不传时保持 v1 各 variant 的既有配色） */
  tone?: ButtonTone;
  /** v2：只渲染图标；label 仍作为无障碍名称 */
  iconOnly?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IoniconName;
  /** 撑满父容器宽度 */
  block?: boolean;
  accessibilityHint?: string;
  /** 覆盖无障碍名称（iconOnly 且文案不适合朗读时使用） */
  accessibilityLabel?: string;
}

const BUTTON_HEIGHT: Record<ButtonSize, number> = {
  sm: hit.buttonSm,
  md: hit.button,
  lg: 52,
};

const BUTTON_PADDING: Record<ButtonSize, number> = {
  sm: space.md,
  md: space.lg,
  lg: space.xl,
};

const BUTTON_TEXT: Record<ButtonSize, "label" | "bodyStrong" | "subtitle"> = {
  sm: "label",
  md: "bodyStrong",
  lg: "subtitle",
};

const BUTTON_ICON: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

/**
 * 按钮配色。v2 用「variant（视觉权重）× tone（语义色）」两轴；
 * 不传 tone 时与 v1 完全一致（primary/secondary/ghost/danger 原配色）。
 */
function buttonPalette(
  colors: ReturnType<typeof useTheme>,
  variant: ButtonVariant,
  tone: ButtonTone | undefined,
): { bg: string; fg: string } {
  switch (variant) {
    case "primary":
      return { bg: tone === "danger" ? colors.danger : colors.primary, fg: colors.textOnAccent };
    case "danger":
      return { bg: colors.dangerMuted, fg: colors.danger };
    case "secondary":
      return {
        bg: colors.surfaceMuted,
        fg: tone === "primary" ? colors.primary : tone === "danger" ? colors.danger : colors.text,
      };
    case "quiet":
      return {
        bg: "transparent",
        fg:
          tone === "primary"
            ? colors.primary
            : tone === "danger"
              ? colors.danger
              : colors.textSecondary,
      };
    case "ghost":
    default:
      return {
        bg: "transparent",
        fg:
          tone === "danger"
            ? colors.danger
            : tone === "default"
              ? colors.text
              : colors.primary,
      };
  }
}

export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  tone,
  iconOnly = false,
  disabled = false,
  loading = false,
  icon,
  block = false,
  accessibilityHint,
  accessibilityLabel,
}: ButtonProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const inactive = disabled || loading;
  const { bg, fg } = buttonPalette(colors, variant, tone);
  const minHeight = BUTTON_HEIGHT[size];
  const pressedBg = bg === "transparent" ? colors.surfaceMuted : bg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === "sm" ? 4 : undefined}
      style={({ pressed }) => [
        styles.button,
        focus,
        {
          minHeight,
          paddingHorizontal: iconOnly ? 0 : BUTTON_PADDING[size],
          width: iconOnly ? minHeight : undefined,
          backgroundColor: pressed ? pressedBg : bg,
          opacity: inactive ? 0.45 : pressed ? 0.82 : 1,
          alignSelf: block ? "stretch" : "flex-start",
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : iconOnly ? (
        <Ionicons name={icon ?? "ellipsis-horizontal"} size={BUTTON_ICON[size]} color={fg} />
      ) : (
        <View style={styles.buttonContent}>
          {icon !== undefined ? <Ionicons name={icon} size={BUTTON_ICON[size]} color={fg} /> : null}
          <AppText variant={BUTTON_TEXT[size]} weight="600" color={fg} lines={1}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- IconButton ---------------- */

export type IconButtonVariant = "plain" | "filled" | "ghost";
export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps {
  icon: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: "default" | "danger";
  /** 旧用法：数字 = 图标像素尺寸；v2 用法："sm" | "md" | "lg" */
  size?: number | IconButtonSize;
  /** 旧用法：true = filled，false = plain */
  filled?: boolean;
  /** v2：视觉形态（优先于 filled） */
  variant?: IconButtonVariant;
  disabled?: boolean;
}

const ICON_BUTTON_ICON_SIZE: Record<IconButtonSize, number> = { sm: 18, md: 20, lg: 24 };
const ICON_BUTTON_BOX: Record<IconButtonSize, number> = { sm: hit.min, md: hit.min, lg: 52 };

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = "default",
  size = 20,
  filled = false,
  variant,
  disabled = false,
}: IconButtonProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);

  const resolvedVariant: IconButtonVariant = variant ?? (filled ? "filled" : "plain");
  const resolvedSize: IconButtonSize =
    typeof size === "number" ? (size >= 24 ? "lg" : size <= 16 ? "sm" : "md") : size;
  const iconSize = typeof size === "number" ? size : ICON_BUTTON_ICON_SIZE[size];
  const fg = tone === "danger" ? colors.danger : colors.textSecondary;

  const idleBg = resolvedVariant === "filled" ? colors.surfaceMuted : "transparent";
  const pressedBg =
    resolvedVariant === "filled"
      ? colors.neutralMuted
      : resolvedVariant === "ghost"
        ? colors.surfaceMuted
        : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        focus,
        {
          width: ICON_BUTTON_BOX[resolvedSize],
          height: ICON_BUTTON_BOX[resolvedSize],
          backgroundColor: pressed ? pressedBg : idleBg,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={fg} />
    </Pressable>
  );
}

/* ---------------- Card ---------------- */

export type CardVariant = "outline" | "raised" | "flat";
export type CardPadding = "none" | "compact" | "normal" | "roomy";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** 紧凑内边距（列表卡片）；等价于 padding="compact" */
  compact?: boolean;
  /** v2：outline 边框 / raised 浮起 / flat 无边框 */
  variant?: CardVariant;
  /** v2：内边距档位（优先于 compact） */
  padding?: CardPadding;
  style?: ViewStyle;
}

const CARD_PADDING: Record<CardPadding, number> = {
  none: 0,
  compact: space.md,
  normal: space.lg,
  roomy: space.xxl,
};

export function Card({
  children,
  onPress,
  accessibilityLabel,
  compact = false,
  variant = "outline",
  padding,
  style,
}: CardProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.md);
  const resolvedPadding = padding ?? (compact ? "compact" : "normal");

  const surfaceStyle: ViewStyle =
    variant === "flat"
      ? { backgroundColor: "transparent", borderWidth: 0 }
      : {
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...(variant === "raised" ? elevation.card : null),
        };

  const base = [
    styles.card,
    surfaceStyle,
    { padding: CARD_PADDING[resolvedPadding] },
    style,
  ];

  if (onPress === undefined) {
    return <View style={base}>{children}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, focus, { opacity: pressed ? 0.88 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/* ---------------- Divider ---------------- */

export type DividerVariant = "hairline" | "inset" | "section";

export function Divider({
  inset = 0,
  variant = "hairline",
  style,
}: {
  inset?: number;
  /** v2：hairline 通栏 / inset 缩进 / section 分组间距 */
  variant?: DividerVariant;
  /** 外部间距（如分组内的上下留白） */
  style?: { marginVertical?: number; marginHorizontal?: number };
}) {
  const colors = useTheme();
  const marginLeft =
    variant === "inset" ? (inset > 0 ? inset : space.lg) : inset;
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: variant === "section" ? colors.borderStrong : colors.border,
          marginLeft,
          marginVertical: variant === "section" ? space.lg : undefined,
        },
        style,
      ]}
    />
  );
}

/* ---------------- Badge ---------------- */

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: IoniconName;
}

/** 状态徽标：底色只用语义 muted 档，文字用语义色——不做装饰性用色 */
export function Badge({ label, tone = "neutral", size = "sm", icon }: BadgeProps) {
  const colors = useTheme();
  const fg = {
    neutral: colors.textSecondary,
    accent: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  }[tone];
  const bg = {
    neutral: colors.neutralMuted,
    accent: colors.primaryMuted,
    success: colors.successMuted,
    warning: colors.warningMuted,
    danger: colors.dangerMuted,
    info: colors.infoMuted,
  }[tone];
  const height = size === "sm" ? 20 : 24;

  return (
    <View
      style={[styles.badge, { backgroundColor: bg, height, paddingHorizontal: size === "sm" ? space.sm : space.md }]}
    >
      {icon !== undefined ? (
        <Ionicons name={icon} size={size === "sm" ? 11 : 13} color={fg} />
      ) : null}
      <AppText
        variant={size === "sm" ? "caption" : "label"}
        weight="600"
        color={fg}
        lines={1}
        style={styles.badgeLabel}
      >
        {label}
      </AppText>
    </View>
  );
}

/* ---------------- ProgressBar ---------------- */

export type ProgressTone = "primary" | "success" | "warning" | "danger";

export interface ProgressBarProps {
  /** 0–1；越界自动收敛 */
  value: number;
  label?: string;
  tone?: ProgressTone;
  style?: ViewStyle;
}

/** 进度条：role=progressbar + 百分比 accessibilityValue */
export function ProgressBar({ value, label, tone = "primary", style }: ProgressBarProps) {
  const colors = useTheme();
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = Math.round(ratio * 100);
  const fill = {
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.progressWrap, style]}
    >
      {label !== undefined ? (
        <View style={styles.progressLabelRow}>
          <AppText variant="caption" tone="secondary" lines={1} style={styles.progressLabel}>
            {label}
          </AppText>
          <AppText variant="caption" tone="tertiary" lines={1}>
            {`${String(pct)}%`}
          </AppText>
        </View>
      ) : null}
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct}%`, backgroundColor: fill },
          ]}
        />
      </View>
    </View>
  );
}

/* ---------------- Skeleton ---------------- */

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/**
 * 骨架屏微光：web 走 CSS keyframes（合成层，不占 JS 线程），native 走 Animated。
 * 系统开启「减弱动态效果」时保持静态色块。
 */
export function Skeleton({ width = "100%", height = 16, radius: radiusValue = radius.xs, style }: SkeletonProps) {
  const colors = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || Platform.OS === "web") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: motion.slow, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: motion.slow, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse, reduced]);

  // web：CSS keyframes（经 StyleSheet 编译成 class，SVG/合成层动画不占 JS 线程）
  const shimmerStyle = Platform.OS === "web" && !reduced ? styles.skeletonShimmer : null;

  const nativeOpacity =
    Platform.OS === "web"
      ? undefined
      : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.95] });

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={t("v2.skeleton.loading")}
      style={[
        {
          width,
          height,
          borderRadius: radiusValue,
          backgroundColor: colors.surfaceMuted,
          opacity: reduced ? 1 : nativeOpacity,
        },
        shimmerStyle,
        style,
      ]}
    />
  );
}

/* ---------------- Tag ---------------- */

export interface TagProps {
  label: string;
  /** 提供时显示移除按钮 */
  onRemove?: () => void;
  tone?: BadgeTone;
  icon?: IoniconName;
  onPress?: () => void;
}

/** 可移除的标签胶囊（标签编辑器 / 详情页元信息） */
export function Tag({ label, onRemove, tone = "neutral", icon, onPress }: TagProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.pill);
  const fg = {
    neutral: colors.textSecondary,
    accent: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  }[tone];
  const bg = {
    neutral: colors.neutralMuted,
    accent: colors.primaryMuted,
    success: colors.successMuted,
    warning: colors.warningMuted,
    danger: colors.dangerMuted,
    info: colors.infoMuted,
  }[tone];

  const content = (
    <>
      {icon !== undefined ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <AppText variant="label" weight="500" color={fg} lines={1} style={styles.tagLabel}>
        {label}
      </AppText>
    </>
  );

  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: bg,
          paddingRight: onRemove !== undefined ? space.xs : space.sm,
        },
      ]}
    >
      {onPress !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          hitSlop={10}
          style={({ pressed }) => [styles.tagMain, focus, { opacity: pressed ? 0.7 : 1 }]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.tagMain}>{content}</View>
      )}
      {onRemove !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("v2.tag.remove", { tag: label })}
          onPress={onRemove}
          hitSlop={14}
          style={({ pressed }) => [styles.tagRemove, { opacity: pressed ? 0.55 : 0.85 }]}
        >
          <Ionicons name="close" size={12} color={fg} />
        </Pressable>
      ) : null}
    </View>
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
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: radius.md,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    maxWidth: 180,
  },
  badgeLabel: {
    flexShrink: 1,
  },
  progressWrap: {
    width: "100%",
    gap: space.xs,
  },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  progressLabel: {
    flex: 1,
    minWidth: 0,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 26,
    paddingLeft: space.sm,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    maxWidth: 220,
  },
  tagMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
    minWidth: 0,
    borderRadius: radius.pill,
  },
  tagLabel: {
    flexShrink: 1,
  },
  tagRemove: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    padding: space.xxl,
    alignItems: "center",
    gap: space.md,
  },
  // RNW 专有样式：只能在 StyleSheet.create 里编译出 @keyframes（inline 不会插规则）。
  // native 不会应用该样式，故保留在同一个表里是安全的。
  skeletonShimmer: {
    animationKeyframes: {
      "0%": { opacity: 0.5 },
      "50%": { opacity: 0.95 },
      "100%": { opacity: 0.5 },
    },
    animationDuration: `${String(motion.slow * 3)}ms`,
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
  } as unknown as ViewStyle,
});

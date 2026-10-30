import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { radius, space } from "../theme/tokens";

export interface ChipProps {
  label: string;
  /** 语义色覆盖（如项目用成功色） */
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  /**
   * 前缀：省略 = 情境（只读态自动补 "@"，可点态保持原样，兼容已有筛选 chip）；
   * null = 不加前缀；"#" = 标签。
   */
  prefix?: string | null;
}

/**
 * 标签胶囊。
 * - 只读态：高 20，用于行内元信息
 * - 可点态：高 34，用于筛选/切换
 */
export function Chip({ label, color, selected = false, onPress, prefix }: ChipProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.pill);
  const accent = color ?? colors.primary;
  const prefixed = prefix === undefined ? (label.startsWith("@") ? label : `@${label}`) : prefix === null ? label : `${prefix}${label}`;
  const interactiveLabel = prefix === undefined ? label : prefixed;

  if (onPress === undefined) {
    return (
      <View style={[styles.readonly, { backgroundColor: colors.surfaceMuted }]}>
        <AppText variant="caption" tone="secondary" lines={1}>
          {prefixed}
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={interactiveLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.interactive,
        focus,
        {
          backgroundColor: selected ? accent : colors.surfaceMuted,
          borderColor: selected ? accent : "transparent",
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppText
        variant="label"
        weight="600"
        color={selected ? colors.onPrimary : colors.textSecondary}
        lines={1}
      >
        {interactiveLabel}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  readonly: {
    height: 20,
    paddingHorizontal: space.sm,
    borderRadius: radius.xs,
    justifyContent: "center",
    maxWidth: 120,
  },
  interactive: {
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    maxWidth: 180,
  },
});

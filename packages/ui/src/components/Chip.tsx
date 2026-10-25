import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { radius, spacing } from "../tokens";

export interface ChipProps {
  label: string;
  color?: string;
  /** 选中态（如情境筛选激活） */
  selected?: boolean;
  onPress?: () => void;
}

/**
 * 标签胶囊（情境/项目等元信息）。
 * 无 onPress：纯展示（minHeight 28）。
 * 有 onPress：可交互——触控目标 ≥44px + 焦点环（ui-ux-pro-max A11y/Touch）。
 */
export function Chip({ label, color, selected = false, onPress }: ChipProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.full);
  const accent = color ?? colors.primary;
  const bg = selected ? accent : colors.surface;
  const fg = selected ? colors.onPrimary : colors.text;
  const display = onPress === undefined ? (label.startsWith("@") ? label : `@${label}`) : label;
  const content = (
    <Text maxFontSizeMultiplier={1.2} style={[styles.label, { color: fg }]} numberOfLines={1}>
      {display}
    </Text>
  );
  if (onPress === undefined) {
    return (
      <View style={[styles.chip, { backgroundColor: bg, borderColor: color ?? colors.border }]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => [
        styles.chipInteractive,
        focus,
        {
          backgroundColor: bg,
          borderColor: color ?? colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 28,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 200,
    justifyContent: "center",
  },
  chipInteractive: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 220,
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
  },
});

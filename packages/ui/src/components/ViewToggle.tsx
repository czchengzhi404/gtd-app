import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { minTouchTarget, radius, spacing } from "../tokens";

export interface ViewToggleOption<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

export interface ViewToggleProps<T extends string> {
  options: ViewToggleOption<T>[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}

/** 视图切换（列表/日历/看板/Timeline）：分段控件，触控目标 ≥44px，焦点环可见 */
export function ViewToggle<T extends string>({ options, value, onChange, label }: ViewToggleProps<T>) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.wrap, { backgroundColor: colors.surface }]}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: option.disabled === true }}
            accessibilityLabel={option.label}
            disabled={option.disabled}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.item,
              focus,
              {
                backgroundColor: active ? colors.bg : "transparent",
                opacity: option.disabled ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? colors.primary : colors.textSecondary },
                active && styles.labelActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    padding: 2,
    alignSelf: "flex-start",
  },
  item: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 15,
  },
  labelActive: {
    fontWeight: "600",
  },
});

import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { SegmentedWrap } from "./Screen";
import { radius, space } from "../theme/tokens";

export interface ViewToggleOption<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

export interface ViewToggleProps<T extends string> {
  options: ViewToggleOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /** 无障碍组名 */
  label: string;
}

/**
 * 分段切换器（列表/看板/日历）。
 * 固定 34px 高、13px 标签、单行省略——不会因文字长度或字体缩放变形。
 */
export function ViewToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: ViewToggleProps<T>) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.xs);
  return (
    <View style={styles.outer}>
      <SegmentedWrap>
        <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.row}>
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
                  styles.segment,
                  focus,
                  {
                    backgroundColor: active ? colors.surface : "transparent",
                    opacity: option.disabled === true ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <AppText
                  variant="label"
                  weight={active ? "600" : "500"}
                  color={active ? colors.primary : colors.textSecondary}
                  lines={1}
                >
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </SegmentedWrap>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  row: {
    flexDirection: "row",
  },
  segment: {
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});

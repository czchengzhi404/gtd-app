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
  /** 行尾插槽（如排序模式开关），与分段控件同行右对齐 */
  trailing?: React.ReactNode;
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
  trailing,
}: ViewToggleProps<T>) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.xs);
  return (
    <View style={styles.outer}>
      <View style={styles.line}>
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
        {trailing !== undefined && trailing !== null ? (
          <View style={styles.trailing}>{trailing}</View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
  },
  trailing: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
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

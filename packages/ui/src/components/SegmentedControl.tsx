import { useRef } from "react";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { elevation, radius, space } from "../theme/tokens";
import { t } from "../i18n";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface SegmentedControlItem<T extends string> {
  key: T;
  label: string;
  icon?: IoniconName;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  items: SegmentedControlItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** 无障碍组名（读屏播报"xxx 选项卡列表"） */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

interface WebKeyEvent {
  key?: string;
  preventDefault?: () => void;
}

/**
 * 受控分段控件（视图切换 / 筛选范围）。
 *
 * - 容器 surfaceMuted，选中段 surface + 轻微阴影（浮起感只属于选中态）
 * - 键盘 ←/→ 在启用项之间循环，Home/End 跳到首尾
 * - 高度 48（44 内容 + 2×2 内边距），满足触控目标
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.xs);
  const segmentRefs = useRef<Record<string, unknown>>({});

  const handleKeyDown = (event: WebKeyEvent) => {
    const key = event.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    const enabled = items.filter((item) => item.disabled !== true);
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((item) => item.key === value);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (key === "ArrowLeft") nextIndex = currentIndex <= 0 ? enabled.length - 1 : currentIndex - 1;
    if (key === "ArrowRight") {
      nextIndex = currentIndex < 0 || currentIndex >= enabled.length - 1 ? 0 : currentIndex + 1;
    }
    if (key === "Home") nextIndex = 0;
    if (key === "End") nextIndex = enabled.length - 1;
    const next = enabled[nextIndex];
    if (next === undefined) return;
    event.preventDefault?.();
    onChange(next.key);
    const node = segmentRefs.current[next.key] as { focus?: () => void } | undefined;
    node?.focus?.();
  };

  const webKeyProps =
    Platform.OS === "web"
      ? ({ onKeyDown: handleKeyDown } as unknown as { onKeyDown: (event: WebKeyEvent) => void })
      : {};

  return (
    <View
      {...webKeyProps}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel ?? t("v2.segmented.label")}
      style={[styles.container, { backgroundColor: colors.surfaceMuted }, style]}
    >
      {items.map((item) => {
        const active = item.key === value;
        const disabled = item.disabled === true;
        return (
          <Pressable
            key={item.key}
            ref={(node) => {
              segmentRefs.current[item.key] = node;
            }}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            focusable
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.segment,
              focus,
              active
                ? [styles.segmentActive, elevation.card, { backgroundColor: colors.surface }]
                : null,
              { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
            ]}
          >
            {item.icon !== undefined ? (
              <Ionicons
                name={item.icon}
                size={15}
                color={active ? colors.primary : colors.textSecondary}
              />
            ) : null}
            <AppText
              variant="label"
              weight={active ? "600" : "500"}
              color={active ? colors.primary : colors.textSecondary}
              lines={1}
              style={styles.segmentLabel}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.xxs,
    borderRadius: radius.sm,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: 44,
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: space.md,
    borderRadius: radius.xs,
  },
  segmentLabel: {
    flexShrink: 1,
  },
  segmentActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
});

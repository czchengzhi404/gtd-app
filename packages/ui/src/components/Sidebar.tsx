import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NAV_ITEMS } from "../nav-config";
import { t, useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { minTouchTarget, radius, spacing } from "../tokens";

export interface SidebarProps {
  activeRoute: string;
  onSelect: (route: string) => void;
  footer?: ReactNode;
}

/**
 * 桌面端左侧导航（≥768 由壳启用）。与移动端底部 Tab 同源于 NAV_ITEMS，
 * 不存在第二套导航定义。文案随语言即时切换。
 */
export function Sidebar({ activeRoute, onSelect, footer }: SidebarProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const brand = t("common.brand");
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      <Text maxFontSizeMultiplier={1.2} accessibilityRole="header" style={[styles.brand, { color: colors.text }]}>
        {brand}
      </Text>
      <View accessibilityRole="tablist">
        {NAV_ITEMS.map((item) => {
          const active = item.route === activeRoute;
          const label = t(item.labelKey);
          return (
            <Pressable
              key={item.route}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => onSelect(item.route)}
              style={({ pressed }) => [
                styles.item,
                focus,
                {
                  backgroundColor: active ? colors.bg : pressed ? colors.border : "transparent",
                },
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: active ? colors.primary : "transparent" }]}
              />
              <Text maxFontSizeMultiplier={1.2} style={[styles.label, { color: active ? colors.text : colors.textSecondary }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {footer !== undefined ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 220,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  brand: {
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: minTouchTarget,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    marginTop: "auto",
    padding: spacing.md,
  },
});

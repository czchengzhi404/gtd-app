import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { NAV_ITEMS } from "../nav-config";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { hit, radius, space } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface SidebarProps {
  activeRoute: string;
  onSelect: (route: string) => void;
  footer?: ReactNode;
}

/**
 * 桌面端左侧栏（≥768）。与移动端 TabBar 同源于 NAV_ITEMS——
 * 同一份导航配置，两种呈现，不存在第二套导航定义。
 */
export function Sidebar({ activeRoute, onSelect, footer }: SidebarProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.canvas, borderRightColor: colors.border }]}>
      <View style={styles.brandRow}>
        <View style={[styles.logo, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark-done" size={16} color={colors.onPrimary} />
        </View>
        <AppText variant="title" lines={1}>
          {t("common.brand")}
        </AppText>
      </View>

      <View accessibilityRole="tablist" style={styles.nav}>
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
                  backgroundColor: active ? colors.surface : pressed ? colors.surfaceMuted : "transparent",
                },
              ]}
            >
              <Ionicons
                name={item.icon as IoniconName}
                size={18}
                color={active ? colors.primary : colors.textTertiary}
              />
              <AppText
                variant="body"
                weight={active ? "600" : "400"}
                color={active ? colors.text : colors.textSecondary}
                lines={1}
                style={styles.itemLabel}
              >
                {label}
              </AppText>
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
    width: 232,
    paddingTop: space.lg,
    paddingHorizontal: space.md,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingBottom: space.lg,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  nav: {
    gap: space.xxs,
  },
  item: {
    minHeight: hit.nav,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    marginTop: "auto",
    paddingVertical: space.md,
  },
});

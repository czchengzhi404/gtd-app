import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NAV_ITEMS } from "../nav-config";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { AppText } from "../theme/AppText";
import { elevation, hit, radius, space } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/** react-navigation 自定义 tabBar 所需的最小 props（结构化，避免依赖其类型包） */
export interface AppTabBarProps {
  state: { routes: { name: string; key: string }[]; index: number };
  navigation: { navigate: (name: string, params?: object) => void };
}

/**
 * 底部导航：独立色块（选中项为主色圆角块）+ 图标 + 固定 11px 标签。
 * 关键约束：
 * - 整条固定高度 62 + 安全区，标签单行、字号与行高写死 → 不可能被文字撑爆
 * - 图标与文字同列垂直居中，选中态仅换底色（无布局位移）
 * - ≥768 由侧栏接管，自动隐藏
 */
export function AppTabBar({ state, navigation }: AppTabBarProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const focus = useFocusStyle(radius.sm);
  const { isTabletUp } = useBreakpoint();

  if (isTabletUp) return null;

  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route) => {
        const item = NAV_ITEMS.find((n) => n.route === route.name);
        if (item === undefined) return null;
        const active = route.name === activeRoute;
        const label = t(item.labelKey);

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => navigation.navigate(route.name)}
            style={({ pressed }) => [styles.tab, focus, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View
              style={[
                styles.tabInner,
                active ? { backgroundColor: colors.primaryMuted } : null,
              ]}
            >
              <Ionicons
                name={item.icon as IoniconName}
                size={21}
                color={active ? colors.primary : colors.textTertiary}
              />
              <AppText
                variant="caption"
                weight={active ? "700" : "500"}
                color={active ? colors.primary : colors.textTertiary}
                lines={1}
                style={styles.tabLabel}
              >
                {label}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: hit.tabBar,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxs,
  },
  tabInner: {
    minWidth: 56,
    maxWidth: "100%",
    height: 46,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: space.xs,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
});

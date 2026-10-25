import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NAV_ITEMS } from "../nav-config";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { minTouchTarget, radius, spacing } from "../tokens";

/** react-navigation 自定义 tabBar 所需的最小 props（结构化，避免依赖其类型包） */
export interface AppTabBarProps {
  state: { routes: { name: string; key: string }[]; index: number };
  navigation: { navigate: (name: string, params?: object) => void };
}

/**
 * 底部导航栏（浮动胶囊式）：图标 + 标签，选中项主题色实心块。
 * - 标签固定 11px（maxFontSizeMultiplier=1，系统大字体不撑爆布局）
 * - 安全区适配；触控目标 ≥56px；≥768（侧栏模式）自动隐藏
 * - 内容由 NAV_ITEMS 单一配置派生，与桌面侧栏同源
 */
export function AppTabBar({ state, navigation }: AppTabBarProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const focus = useFocusStyle(radius.lg);
  const { isTabletUp } = useBreakpoint();

  if (isTabletUp) return null;

  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.bg === "#FFFFFF" ? "#000000" : "#000000",
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
              style={({ pressed }) => [
                styles.item,
                focus,
                {
                  backgroundColor: active ? colors.primary : "transparent",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Ionicons
                name={item.icon as IoniconName}
                size={20}
                color={active ? colors.onPrimary : colors.textSecondary}
              />
              <Text
                maxFontSizeMultiplier={1}
                numberOfLines={1}
                style={[styles.label, { color: active ? colors.onPrimary : colors.textSecondary }]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
  },
  pill: {
    flexDirection: "row",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 5,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: {
    flex: 1,
    minHeight: minTouchTarget + 8,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
});

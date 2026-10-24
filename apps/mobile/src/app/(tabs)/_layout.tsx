import { Tabs, usePathname, router } from "expo-router";
import { View } from "react-native";

import { NAV_ITEMS, Sidebar, t, useT, useBreakpoint } from "@gtd/ui";

/**
 * Tab 导航：由 NAV_ITEMS 单一配置派生（≤5 项）。
 * ≥768：隐藏底部 Tab，切换为左侧栏 + 内容区（同一套路由树，无第二套导航）。
 * 标题随语言即时切换（useT 触发重渲染）。
 */
export default function TabsLayout() {
  const { isTabletUp } = useBreakpoint();
  const pathname = usePathname();
  const t = useT();
  const activeRoute = (pathname?.split("/")[1] ?? "index") || "index";

  const screens = NAV_ITEMS.map((item) => (
    <Tabs.Screen
      key={item.route}
      name={item.route}
      options={{
        title: t(item.labelKey),
        tabBarStyle: isTabletUp ? { display: "none" } : undefined,
      }}
    />
  ));

  if (!isTabletUp) {
    return <Tabs>{screens}</Tabs>;
  }

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <Sidebar
        activeRoute={activeRoute}
        onSelect={(route) => {
          router.navigate(route === "index" ? "/" : `/${route}`);
        }}
      />
      <Tabs screenOptions={{ tabBarStyle: { display: "none" } }}>{screens}</Tabs>
    </View>
  );
}

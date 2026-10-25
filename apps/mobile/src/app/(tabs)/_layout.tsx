import { Tabs, usePathname, router } from "expo-router";
import { View } from "react-native";

import { AppTabBar, NAV_ITEMS, Sidebar, useT, useBreakpoint } from "@gtd/ui";

/**
 * Tab 导航：由 NAV_ITEMS 单一配置派生（≤5 项）。
 * 窄屏：自定义浮动胶囊 TabBar（图标+标签，标签不随系统字体缩放）；
 * ≥768：隐藏 TabBar，切换为左侧栏 + 内容区（同一套路由树）。
 */
export default function TabsLayout() {
  const { isTabletUp } = useBreakpoint();
  const pathname = usePathname();
  const t = useT();
  const activeRoute = (pathname?.split("/")[1] ?? "index") || "index";

  const screens = NAV_ITEMS.map((item) => (
    <Tabs.Screen key={item.route} name={item.route} options={{ title: t(item.labelKey) }} />
  ));

  if (!isTabletUp) {
    return (
      <Tabs
        tabBar={(props) => <AppTabBar state={props.state} navigation={props.navigation} />}
      >
        {screens}
      </Tabs>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <Sidebar
        activeRoute={activeRoute}
        onSelect={(route) => {
          router.navigate(route === "index" ? "/" : `/${route}`);
        }}
      />
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
        {screens}
      </Tabs>
    </View>
  );
}

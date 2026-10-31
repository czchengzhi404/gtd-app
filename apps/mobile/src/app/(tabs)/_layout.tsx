import { Tabs, usePathname, router } from "expo-router";
import { View } from "react-native";

import { AppTabBar, AppText, NAV_ITEMS, Sidebar, useTheme, useT, useBreakpoint, useAppStore } from "@gtd/ui";
import { getInboxTasks, getTodayTasks } from "@gtd/core";

/**
 * Tab 导航：由 NAV_ITEMS 单一配置派生（≤5 项）。
 * - 窄屏：自定义底部 TabBar（定高、图标 + 固定字号标签）
 * - ≥768：隐藏 TabBar，左侧栏 + 内容区（同一套路由树）
 * - 顶部标题：用 AppText 渲染（字号锁定，不随系统字体缩放）
 */
export default function TabsLayout() {
  const { isTabletUp } = useBreakpoint();
  const pathname = usePathname();
  const colors = useTheme();
  const tr = useT();
  const activeRoute = (pathname?.split("/")[1] ?? "index") || "index";
  const inboxCount = useAppStore((s) => getInboxTasks(s).length);
  const todayCount = useAppStore((s) => getTodayTasks(s, Date.now()).length);
  const badges: Record<string, number> = { index: inboxCount, today: todayCount };

  const headingOptions = {
    headerStyle: { backgroundColor: colors.canvas },
    headerShadowVisible: false,
    headerTitleAlign: "left" as const,
    headerTitle: (props: { children: string }) => (
      <AppText variant="display" lines={1}>
        {props.children}
      </AppText>
    ),
  };

  const screens = NAV_ITEMS.map((item) => (
    <Tabs.Screen key={item.route} name={item.route} options={{ title: tr(item.labelKey) }} />
  ));

  if (!isTabletUp) {
    return (
      <Tabs
        tabBar={(props) => <AppTabBar state={props.state} navigation={props.navigation} badges={badges} />}
        screenOptions={headingOptions}
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
      <Tabs
        screenOptions={{
          ...headingOptions,
          tabBarStyle: { display: "none" },
        }}
      >
        {screens}
      </Tabs>
    </View>
  );
}

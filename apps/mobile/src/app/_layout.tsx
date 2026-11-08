import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";

import {
  AppText,
  Screen,
  ErrorBoundary,
  ThemeProvider,
  ToastHost,
  UndoHost,
  space,
  useAppStore,
  useTheme,
  useT,
  PromptHost,
} from "@gtd/ui";
import { appStore, bootstrapStore, runCommand } from "@gtd/core";
import { initPlatform } from "@/platform/bootstrap";
import { startSyncScheduler } from "@/platform/sync-scheduler";
import { installFontScaleOverride } from "@/platform/font-scale";
import { ensureBuiltinFont, isBuiltinFontSelected } from "@/platform/font-loader";
import { autoCheckForUpdate } from "@/platform/update-check";
import { CommandPaletteHost } from "@/platform/CommandPaletteHost";
import { installGlobalErrorHandler, recordCrash } from "@/platform/crash-log";

installFontScaleOverride();
// 先装全局错误捕获：任何后续初始化/渲染错误都至少能留下记录，而不是直接闪退
installGlobalErrorHandler();

/**
 * 根布局：注入平台端口 → 迁移（原生）→ 种子 → bootstrap → 事件/通知接线。
 * 主题（日夜/字体）由 ThemeProvider 从 kv 读取，设置页修改后即时生效。
 * 内置字体懒加载：bootstrap 之后再按 kv 判断是否需要载入（默认系统字体不载）。
 */
export default function RootLayout() {
  const [error, setError] = useState<string | null>(null);
  const loaded = useAppStore((s) => s.loaded);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    let stopSync: (() => void) | undefined;
    void (async () => {
      try {
        const result = await initPlatform();
        cleanup = result.cleanup;
        await bootstrapStore();
        if (isBuiltinFontSelected()) {
          await ensureBuiltinFont();
        }
        // 自动同步：启动/回前台/本地改动（20s 合并）触发；未配置时自动空转
        if (!cancelled) stopSync = startSyncScheduler();
        // 启动时静默查一次 GitHub release（一天一次，失败不打扰），
        // 有新版就写进 kv，由「更多」页横幅和关于页引导下载。
        if (!cancelled) {
          void autoCheckForUpdate(Constants.expoConfig?.version ?? "0.0.0").catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          appStore.setState({ lastError: message });
        }
      }
    })();
    return () => {
      cancelled = true;
      stopSync?.();
      cleanup?.();
    };
  }, []);

  // 首次启动：只在「从没用过」（无任务）时展示引导；老用户升级不打扰，直接补标记
  useEffect(() => {
    if (!loaded || error !== null) return;
    const state = appStore.getState();
    if (state.kv["onboarding.done"] === "1") return;
    if (Object.keys(state.tasks).length > 0) {
      void runCommand("settings.set", { key: "onboarding.done", value: 1 }).catch(() => undefined);
      return;
    }
    router.replace("/onboarding");
  }, [loaded, error]);

  return (
    <ErrorBoundary
      onError={(error, info) => void recordCrash("render", error, info.componentStack ?? "")}
    >
      <ThemeProvider>
      <StatusBar style="auto" />
      {error !== null ? (
        <BootError message={error} />
      ) : (
        <>
          <StackScreens />
          <CommandPaletteHost />
          <PromptHost />
          <UndoHost />
          <ToastHost bottomOffset={132} />
        </>
      )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

/**
 * Stack 路由标题使用 useT 以随语言/字体切换。
 *
 * 哪些页面隐藏自身 header：凡是页面内已经用 `PageHeader` 自绘标题的（带副标题/操作区），
 * 都设 `headerShown: false`，否则会出现两层标题栏 —— 上面是 Stack 的标题 + 返回箭头，
 * 紧跟着又是 PageHeader 的同一标题 + 第二个返回箭头。tabs 里的收集箱/今天早就这么做了
 * （见 (tabs)/_layout.tsx），这里补齐 Stack 侧的同类页面。
 */
function StackScreens() {
  const t = useT();
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="task/[id]" options={{ title: t("detail.title") }} />
      <Stack.Screen name="project/[id]" options={{ title: t("nav.projects") }} />
      <Stack.Screen name="review" options={{ title: t("review.title") }} />
      <Stack.Screen name="completed" options={{ title: t("completed.title") }} />
      <Stack.Screen name="trash" options={{ title: t("trash.title") }} />
      <Stack.Screen name="add" options={{ title: t("nav.inbox"), headerShown: false }} />
      <Stack.Screen name="about" options={{ title: t("more.about") }} />
      <Stack.Screen name="process" options={{ title: t("app.route.process") }} />
      <Stack.Screen name="search" options={{ title: t("app.route.search") }} />
      <Stack.Screen name="insights" options={{ title: t("app.route.insights") }} />
      <Stack.Screen name="matrix" options={{ title: t("app.route.matrix") }} />
      <Stack.Screen name="history" options={{ title: t("history.title"), headerShown: false }} />
      <Stack.Screen name="materials" options={{ title: t("materials.title"), headerShown: false }} />
      <Stack.Screen name="writing" options={{ title: t("writing.title"), headerShown: false }} />
      <Stack.Screen name="recent" options={{ title: t("app.more.recent"), headerShown: false }} />
      <Stack.Screen name="import" options={{ title: t("app.route.importPage"), headerShown: false }} />
      <Stack.Screen name="templates" options={{ title: t("template.routeTitle"), headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: t("app.more.settings"), headerShown: false }} />
      <Stack.Screen name="data" options={{ title: t("more.group.data"), headerShown: false }} />
      <Stack.Screen name="sync" options={{ title: t("sync.pageTitle") }} />
    </Stack>
  );
}

function BootError({ message }: { message: string }) {
  const colors = useTheme();
  const t = useT();
  return (
    <Screen>
      <View style={styles.errorWrap}>
        <AppText variant="subtitle" color={colors.danger} lines={2}>
          {t("boot.error")}
        </AppText>
        <AppText variant="body" lines={6}>
          {message}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorWrap: {
    flex: 1,
    padding: space.xxl,
    gap: space.sm,
    justifyContent: "center",
  },
});

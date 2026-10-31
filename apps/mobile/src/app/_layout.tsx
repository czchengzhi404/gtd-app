import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

import { Screen, ThemeProvider, useTheme, useT, PromptHost } from "@gtd/ui";
import { appStore, bootstrapStore } from "@gtd/core";
import { initPlatform } from "@/platform/bootstrap";
import { installFontScaleOverride } from "@/platform/font-scale";
import { ensureBuiltinFont, isBuiltinFontSelected } from "@/platform/font-loader";
import { CommandPaletteHost } from "@/platform/CommandPaletteHost";

installFontScaleOverride();

/**
 * 根布局：注入平台端口 → 迁移（原生）→ 种子 → bootstrap → 事件/通知接线。
 * 主题（日夜/字体）由 ThemeProvider 从 kv 读取，设置页修改后即时生效。
 * 内置字体懒加载：bootstrap 之后再按 kv 判断是否需要载入（默认系统字体不载）。
 */
export default function RootLayout() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const result = await initPlatform();
        cleanup = result.cleanup;
        await bootstrapStore();
        if (isBuiltinFontSelected()) {
          await ensureBuiltinFont();
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
      cleanup?.();
    };
  }, []);

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      {error !== null ? (
        <BootError message={error} />
      ) : (
        <>
          <StackScreens />
          <CommandPaletteHost />
          <PromptHost />
        </>
      )}
    </ThemeProvider>
  );
}

/** Stack 路由标题使用 useT 以随语言/字体切换 */
function StackScreens() {
  const t = useT();
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="task/[id]" options={{ title: t("detail.title") }} />
      <Stack.Screen name="project/[id]" options={{ title: t("nav.projects") }} />
      <Stack.Screen name="review" options={{ title: t("review.title") }} />
      <Stack.Screen name="completed" options={{ title: t("completed.title") }} />
      <Stack.Screen name="trash" options={{ title: t("trash.title") }} />
      <Stack.Screen name="add" options={{ title: t("nav.inbox"), headerShown: false }} />
      <Stack.Screen name="about" options={{ title: t("more.about") }} />
    </Stack>
  );
}

function BootError({ message }: { message: string }) {
  const colors = useTheme();
  const t = useT();
  return (
    <Screen>
      <View style={styles.errorWrap}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>{t("boot.error")}</Text>
        <Text style={[styles.errorBody, { color: colors.text }]}>{message}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorWrap: {
    flex: 1,
    padding: 24,
    gap: 8,
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  errorBody: {
    fontSize: 16,
    lineHeight: 24,
  },
});

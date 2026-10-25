import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "react-native";

import { Screen, ThemeProvider, useTheme, setLang, useT } from "@gtd/ui";

function setLangFromKv(lang: "zh" | "en"): void {
  setLang(lang);
}
import { appStore, bootstrapStore } from "@gtd/core";
import { initPlatform } from "@/platform/bootstrap";

/**
 * 根布局：注入平台端口（Electron→IPC / 原生→expo-sqlite）→ 迁移（原生）→
 * 种子（幂等）→ bootstrap 全量加载（含 kv.lang 应用）→ 事件/通知接线。
 */
export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const result = await initPlatform();
        cleanup = result.cleanup;
        await bootstrapStore();
        // 语言持久化：bootstrap 后应用 kv 里的设置
        const saved = appStore.getState().kv["lang"];
        if (saved === "en" || saved === "zh") {
          setLangFromKv(saved);
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
    <ThemeProvider scheme={scheme}>
      <StatusBar style="auto" />
      {error !== null ? (
        <BootError message={error} />
      ) : (
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="task/[id]" options={{ title: t("detail.title") }} />
          <Stack.Screen name="review" options={{ title: t("review.title") }} />
          <Stack.Screen name="about" options={{ title: t("more.about") }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}

function BootError({ message }: { message: string }) {
  const colors = useTheme();
  const t = useT();
  return (
    <Screen>
      <View style={styles.errorWrap}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.errorTitle, { color: colors.danger }]}>{t("boot.error")}</Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.errorBody, { color: colors.text }]}>{message}</Text>
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

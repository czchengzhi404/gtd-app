import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";

import {
  AppText,
  Card,
  Divider,
  PageHeader,
  Screen,
  SectionHeader,
  SegmentedControl,
  getLang,
  setLang,
  space,
  useAppStore,
  useTheme,
  useT,
  hit,
  type Lang,
} from "@gtd/ui";
import { runCommand } from "@gtd/core";
import { ensureBuiltinFont } from "@/platform/font-loader";

type ThemeMode = "system" | "light" | "dark";
type FontChoice = "wenkai" | "system";

/**
 * 设置：主题 / 字体 / 语言 / 关于。
 *
 * 从「更多」拆出来的原因：一个屏里同时铺主题、字体、语言、关于四块控件，
 * 首屏密度过高。这里只保留「偏好」这一类，低频且需要完整说明的放在下方。
 * 所有写入都走 `runCommand("settings.set")`，ThemeProvider 监听 kv 即时生效。
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const kv = useAppStore((s) => s.kv);
  const version = Constants.expoConfig?.version ?? "0.1.0";
  const [lang, setLangUi] = useState<Lang>(getLang());

  // kv 里可能是任意历史值，读出来先收敛到三选一的合法值
  const themeMode: ThemeMode =
    kv["theme.mode"] === "light" ? "light" : kv["theme.mode"] === "dark" ? "dark" : "system";
  const fontChoice: FontChoice = kv["font.family"] === "LXGWWenKai" ? "wenkai" : "system";

  const onTheme = (next: ThemeMode) => {
    void runCommand("settings.set", { key: "theme.mode", value: next }).catch(() => undefined);
  };

  const onFont = (next: FontChoice) => {
    void (async () => {
      try {
        // 文楷是内置字体：先确保已注册再切，避免切过去是一段空白等字体
        if (next === "wenkai") await ensureBuiltinFont();
        await runCommand("settings.set", {
          key: "font.family",
          value: next === "wenkai" ? "LXGWWenKai" : "system",
        });
      } catch {
        // 字体载入失败保持当前字体，不弹错：设置项只是偏好，不是数据写入
      }
    })();
  };

  const onLang = (next: Lang) => {
    setLang(next);
    setLangUi(next);
    void runCommand("settings.set", { key: "lang", value: next }).catch(() => undefined);
  };

  return (
    <Screen>
      <PageHeader
        title={t("app.more.settings")}
        onBack={() => router.back()}
        backLabel={t("app.common.back")}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
      >
        <View style={styles.column}>
          <SectionHeader title={t("more.themeSection")} />
          <Card variant="outline" padding="normal" style={styles.card}>
            <SegmentedControl
              items={[
                { key: "system", label: t("more.theme.system") },
                { key: "light", label: t("more.theme.light") },
                { key: "dark", label: t("more.theme.dark") },
              ]}
              value={themeMode}
              onChange={onTheme}
              accessibilityLabel={t("more.themeSection")}
            />
          </Card>

          <SectionHeader title={t("more.fontSection")} />
          <Card variant="outline" padding="normal" style={styles.card}>
            <SegmentedControl
              items={[
                { key: "wenkai", label: t("more.font.wenkai") },
                { key: "system", label: t("more.font.system") },
              ]}
              value={fontChoice}
              onChange={onFont}
              accessibilityLabel={t("more.fontSection")}
            />
          </Card>

          <SectionHeader title={t("more.language")} />
          <Card variant="outline" padding="normal" style={styles.card}>
            <SegmentedControl
              items={[
                { key: "zh", label: t("more.lang.zh") },
                { key: "en", label: t("more.lang.en") },
              ]}
              value={lang}
              onChange={onLang}
              accessibilityLabel={t("more.language")}
            />
          </Card>

          <SectionHeader title={t("app.more.group.about")} />
          <Card variant="outline" padding="none" style={styles.card}>
            <EntryRow
              icon="information-circle-outline"
              label={t("more.about")}
              onPress={() => router.push("/about")}
            />
            <Divider inset={space.lg} />
            <EntryRow
              icon="document-text-outline"
              label={t("app.more.license")}
              onPress={() => router.push("/about?section=license")}
            />
            <Divider inset={space.lg} />
            <EntryRow
              icon="shield-checkmark-outline"
              label={t("app.more.privacy")}
              onPress={() => router.push("/about?section=privacy")}
            />
            <Divider inset={space.lg} />
            <View style={styles.versionRow}>
              <AppText variant="label" tone="secondary" lines={1}>
                {t("app.more.version", { version })}
              </AppText>
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** 入口行：图标 + 主文案 + chevron */
function EntryRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint === undefined ? label : `${label}，${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.entryRow, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View style={styles.entryText}>
        <AppText variant="body" lines={1}>
          {label}
        </AppText>
        {hint !== undefined ? (
          <AppText variant="caption" tone="tertiary" lines={1}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.sm,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  card: {
    marginHorizontal: space.lg,
    gap: space.sm,
  },
  entryRow: {
    minHeight: hit.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  entryText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  versionRow: {
    minHeight: hit.row,
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
});

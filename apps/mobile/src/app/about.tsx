import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import {
  AppText,
  Button,
  Card,
  Divider,
  Screen,
  SectionHeader,
  useAppStore,
  radius,
  space,
  useTheme,
  useT,
  showToast,
} from "@gtd/ui";
import { checkForUpdate, openReleasesPage, persistUpdateCheck, readPendingUpdate, KV_UPDATE_CHECKED_AT } from "@/platform/update-check";
import { GITHUB_URL, ISSUES_URL, openExternalUrl } from "@/platform/links";

/**
 * 关于：版本 / 更新 / 开源（GitHub、问题反馈）/ 开源许可 / 隐私说明。
 * 更多页的两个入口带 `section` 参数进入，对应卡片用主色边框高亮（不额外弹层）。
 */
export default function AboutScreen() {
  const colors = useTheme();
  const t = useT();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const version = Constants.expoConfig?.version ?? "0.1.0";
  const kv = useAppStore((s) => s.kv);
  const [checking, setChecking] = useState(false);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);

  // 启动时自动检测的结果（launch 时写进 kv）；没有就是 null
  const pending = readPendingUpdate(kv, version);
  const checkedAt = Number(kv[KV_UPDATE_CHECKED_AT] ?? 0);
  const lastChecked = checkedAt > 0 ? new Date(checkedAt).toLocaleString() : null;

  const open = async (url: string) => {
    const ok = await openExternalUrl(url);
    if (!ok) showToast({ message: t("links.openFailed"), tone: "danger" });
  };

  const onCheckUpdate = async () => {
    setChecking(true);
    try {
      const result = await checkForUpdate(version);
      if (!result.ok) {
        showToast({ message: t("about.checkFailed", { message: result.message }), tone: "danger" });
        return;
      }
      await persistUpdateCheck(result);
      if (result.hasUpdate) {
        setUpdateUrl(result.url);
        showToast({ message: t("about.updateAvailable", { version: result.latest ?? "" }), tone: "info" });
      } else {
        setUpdateUrl(null);
        showToast({ message: t("about.upToDate"), tone: "success" });
      }
    } finally {
      setChecking(false);
    }
  };

  const highlightLicense = section === "license";
  const highlightPrivacy = section === "privacy";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <AppText variant="hero" lines={1}>
              {t("about.title")}
            </AppText>
            <AppText variant="body" tone="secondary" lines={2}>
              {t("about.body", { version })}
            </AppText>
          </View>

          <SectionHeader title={t("app.about.versionLabel")} />
          {pending !== null ? (
            <Card
              variant="outline"
              padding="normal"
              style={{ ...styles.card, borderColor: colors.primary, backgroundColor: colors.surfaceMuted }}
            >
              <AppText variant="bodyStrong" lines={2}>
                {t("update.banner", { version: pending.version })}
              </AppText>
              <View style={styles.updateRow}>
                <Button
                  label={t("about.download")}
                  icon="open-outline"
                  size="sm"
                  variant="primary"
                  onPress={() => void openReleasesPage(pending.url)}
                />
              </View>
            </Card>
          ) : null}
          <Card variant="outline" padding="normal" style={styles.card}>
            <View style={styles.updateRow}>
              <Button
                label={checking ? t("about.checking") : t("about.checkUpdate")}
                icon="cloud-download-outline"
                size="sm"
                disabled={checking}
                onPress={() => void onCheckUpdate()}
              />
              {updateUrl !== null ? (
                <Button
                  label={t("about.download")}
                  icon="open-outline"
                  size="sm"
                  variant="primary"
                  onPress={() => void openReleasesPage(updateUrl)}
                />
              ) : null}
            </View>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {lastChecked !== null ? t("about.lastChecked", { time: lastChecked }) : t("about.neverChecked")}
            </AppText>
          </Card>
          <Card variant="outline" padding="normal" style={styles.card}>
            <AppText variant="mono" lines={1}>
              {version}
            </AppText>
          </Card>

          <SectionHeader title={t("about.openSource")} />
          <Card variant="outline" padding="none" style={styles.card}>
            <LinkRow
              icon="logo-github"
              label={t("about.github")}
              hint={t("about.githubHint")}
              onPress={() => void open(GITHUB_URL)}
            />
            <Divider inset={space.lg} />
            <LinkRow
              icon="chatbubble-ellipses-outline"
              label={t("about.issues")}
              hint={t("about.issuesHint")}
              onPress={() => void open(ISSUES_URL)}
            />
          </Card>

          <SectionHeader title={t("app.about.licenseTitle")} />
          <Card
            variant="outline"
            padding="normal"
            style={
              highlightLicense
                ? {
                    ...styles.card,
                    borderColor: colors.primary,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                  }
                : styles.card
            }
          >
            <AppText variant="body" tone="secondary" lines={0}>
              {t("app.about.licenseBody")}
            </AppText>
          </Card>

          <SectionHeader title={t("app.about.privacyTitle")} />
          <Card
            variant="outline"
            padding="normal"
            style={
              highlightPrivacy
                ? {
                    ...styles.card,
                    borderColor: colors.primary,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                  }
                : styles.card
            }
          >
            <AppText variant="body" tone="secondary" lines={0}>
              {t("app.about.privacyBody")}
            </AppText>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** 外链行：图标 + 主文案 + 说明 + chevron（与更多页的 EntryRow 同款，不跨路由共享） */
function LinkRow({
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
      accessibilityRole="link"
      accessibilityLabel={hint === undefined ? label : `${label}，${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View style={styles.linkText}>
        <AppText variant="body" lines={1}>
          {label}
        </AppText>
        {hint !== undefined ? (
          <AppText variant="caption" tone="tertiary" lines={1}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },

  updateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
  content: {
    paddingBottom: space.huge,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    gap: space.sm,
  },
  card: {
    marginHorizontal: space.lg,
    borderRadius: radius.md,
    gap: space.xs,
  },
});

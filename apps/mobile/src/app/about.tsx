import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import Constants from "expo-constants";

import {
  AppText,
  Button,
  Card,
  Screen,
  SectionHeader,
  radius,
  space,
  useTheme,
  useT,
  showToast,
} from "@gtd/ui";
import { checkForUpdate, openReleasesPage } from "@/platform/update-check";

/**
 * 关于：版本 / 开源许可 / 隐私说明。
 * 更多页的两个入口带 `section` 参数进入，对应卡片用主色边框高亮（不额外弹层）。
 */
export default function AboutScreen() {
  const colors = useTheme();
  const t = useT();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const version = Constants.expoConfig?.version ?? "0.1.0";
  const [checking, setChecking] = useState(false);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);

  const onCheckUpdate = async () => {
    setChecking(true);
    try {
      const result = await checkForUpdate(version);
      if (!result.ok) {
        showToast({ message: t("about.checkFailed", { message: result.message }), tone: "danger" });
        return;
      }
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
          </Card>
          <Card variant="outline" padding="normal" style={styles.card}>
            <AppText variant="mono" lines={1}>
              {version}
            </AppText>
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

const styles = StyleSheet.create({
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

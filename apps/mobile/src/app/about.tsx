import { StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

import { Screen, useTheme, useT } from "@gtd/ui";

/** 关于页：品牌名不本地化（GTD 清单 / GTD List 随语言），版本号注入 */
export default function AboutScreen() {
  const colors = useTheme();
  const t = useT();
  const version = Constants.expoConfig?.version ?? "0.1.0";
  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.text }]}>{t("about.title")}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t("about.body", { version })}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
});

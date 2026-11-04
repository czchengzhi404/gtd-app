import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { AppText } from "../theme/AppText";
import { Button } from "../theme/primitives";
import { useTheme } from "../hooks/useTheme";
import { useT } from "../i18n";
import { radius, space } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface OnboardingProps {
  /** 跳过或走完：调用方负责写「已看过」标记并离开 */
  onDone: () => void;
  /** 最后一屏「创建示例任务」：调用方建完示例后自行 onDone */
  onTrySample?: () => void;
}

interface Slide {
  icon: IoniconName;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: Slide[] = [
  { icon: "add-circle-outline", titleKey: "onboarding.s1.title", bodyKey: "onboarding.s1.body" },
  { icon: "layers-outline", titleKey: "onboarding.s2.title", bodyKey: "onboarding.s2.body" },
  { icon: "sunny-outline", titleKey: "onboarding.s3.title", bodyKey: "onboarding.s3.body" },
];

/**
 * 首次启动引导：三屏说明「记 → 理清 → 今天」，最后一屏给一个示例任务。
 * 只做认知建立，不强制配置（同步/主题等留到「更多」里按需开启）。
 */
export function Onboarding({ onDone, onTrySample }: OnboardingProps) {
  const colors = useTheme();
  const t = useT();
  const [index, setIndex] = useState(0);

  const slide = SLIDES[Math.min(index, SLIDES.length - 1)] as Slide;
  const last = index === SLIDES.length - 1;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.canvas }]} accessibilityRole="summary">
      <View style={styles.top}>
        <Button label={t("onboarding.skip")} variant="quiet" size="sm" onPress={onDone} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name={slide.icon} size={34} color={colors.primary} />
        </View>
        <AppText variant="hero" lines={3} align="center" style={styles.title}>
          {t(slide.titleKey)}
        </AppText>
        <AppText variant="body" tone="secondary" lines={6} align="center" style={styles.text}>
          {t(slide.bodyKey)}
        </AppText>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {SLIDES.map((item, i) => (
            <View
              key={item.titleKey}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.primary : colors.border,
                  width: i === index ? 18 : 6,
                },
              ]}
            />
          ))}
        </View>
        {last ? (
          <View style={styles.lastActions}>
            {onTrySample !== undefined ? (
              <Button
                label={t("onboarding.trySample")}
                variant="secondary"
                icon="sparkles-outline"
                onPress={onTrySample}
              />
            ) : null}
            <Button label={t("onboarding.start")} variant="primary" onPress={onDone} />
          </View>
        ) : (
          <Button
            label={t("onboarding.next")}
            variant="primary"
            icon="arrow-forward"
            onPress={() => setIndex((i) => Math.min(SLIDES.length - 1, i + 1))}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  top: {
    alignItems: "flex-end",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  title: {
    maxWidth: 320,
  },
  text: {
    maxWidth: 330,
  },
  footer: {
    gap: space.md,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  lastActions: {
    gap: space.sm,
  },
});

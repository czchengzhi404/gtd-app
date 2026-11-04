import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Card } from "../theme/primitives";
import { radius, space } from "../theme/tokens";
import { t } from "../i18n";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type StatTone = "default" | "primary" | "success" | "warning" | "danger" | "info";

export interface StatTileProps {
  label: string;
  value: string | number;
  /** 环比文案，如 "+12%" / "-3"；正负决定语义色 */
  delta?: string;
  icon?: IoniconName;
  tone?: StatTone;
}

/**
 * 统计卡片（统计面板用）。
 * 所有文本走 AppText；数值用 display 阶梯建立视觉锚点。
 */
export function StatTile({ label, value, delta, icon, tone = "default" }: StatTileProps) {
  const colors = useTheme();
  const accent = {
    default: colors.textSecondary,
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  }[tone];
  const deltaText = delta?.trim() ?? "";
  const negative = deltaText.startsWith("-") || deltaText.startsWith("−");
  const flat = /^[+±]?0([.,]0+)?%?$/.test(deltaText);
  const deltaColor = flat ? colors.textSecondary : negative ? colors.danger : colors.success;

  return (
    <Card variant="outline" padding="normal" style={styles.card}>
      <View style={styles.labelRow}>
        <AppText variant="label" tone="secondary" lines={1} style={styles.label}>
          {label}
        </AppText>
        {icon !== undefined ? (
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name={icon} size={16} color={accent} />
          </View>
        ) : null}
      </View>
      <AppText variant="display" lines={1}>
        {String(value)}
      </AppText>
      {delta !== undefined && deltaText.length > 0 ? (
        <View style={styles.deltaRow}>
          <Ionicons
            name={flat ? "remove-outline" : negative ? "trending-down" : "trending-up"}
            size={12}
            color={deltaColor}
          />
          <AppText
            variant="caption"
            color={deltaColor}
            lines={1}
            accessibilityLabel={t("v2.stat.delta", { delta: deltaText })}
          >
            {deltaText}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.xs,
    minWidth: 160,
    flexGrow: 1,
    flexBasis: 160,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
});

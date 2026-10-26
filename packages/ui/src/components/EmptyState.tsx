import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { space } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: IoniconName;
}

/** 空态：轻量、留白充足，不占用交互焦点 */
export function EmptyState({ title, hint, icon = "checkmark-done-outline" }: EmptyStateProps) {
  const colors = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${title}。${hint ?? ""}`}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name={icon} size={26} color={colors.textTertiary} />
      </View>
      <AppText variant="bodyStrong" lines={2} align="center" style={styles.title}>
        {title}
      </AppText>
      {hint !== undefined ? (
        <AppText variant="label" tone="tertiary" lines={3} align="center" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxxl,
    paddingVertical: space.xxl,
    gap: space.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  title: {
    maxWidth: 260,
  },
  hint: {
    maxWidth: 280,
  },
});

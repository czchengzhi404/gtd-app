import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { spacing } from "../tokens";

export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textSecondary }]}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

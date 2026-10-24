import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { spacing } from "../tokens";

/** 列表空态：图标/说明居中，正文 ≥16px */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const colors = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${title}。${hint ?? ""}`}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
});

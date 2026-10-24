import { StyleSheet, Text } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { radius, spacing } from "../tokens";

export interface FabProps {
  onPress: () => void;
  label?: string;
}

/** 悬浮新建按钮。触控目标 ≥48px；accessibilityRole=button。 */
export function Fab({ onPress, label = "新建任务" }: FabProps) {
  const colors = useTheme();
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.fab, { backgroundColor: colors.primary, color: colors.onPrimary }]}
    >
      ＋
    </Text>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    width: 52,
    height: 52,
    borderRadius: 26,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 28,
    lineHeight: 52,
    fontWeight: "600",
  },
});

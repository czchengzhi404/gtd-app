import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { elevation } from "../theme/tokens";

export interface FabProps {
  onPress: () => void;
  label?: string;
  icon?: "add" | "create-outline";
}

/** 悬浮新建按钮（56×56，主色，浮起阴影）。仅在有明确"新建"动作的页面使用。 */
export function Fab({ onPress, label = "新建", icon = "add" }: FabProps) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        elevation.float,
        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={26} color={colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});

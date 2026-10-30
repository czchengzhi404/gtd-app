import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "../theme/AppText";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { elevation, hit, radius, space } from "../theme/tokens";

export interface BulkActionBarProps {
  count: number;
  onComplete: () => void;
  onDelete: () => void;
  onMove: () => void;
  onClear: () => void;
  /** 长按进入多选后退出 */
  onExit?: () => void;
  busy?: boolean;
}

/**
 * 批量操作条：底部悬浮，覆盖在内容之上（不挤压列表高度）。
 * 只在多选模式下出现，退出后完全移除，避免残留可访问节点。
 */
export function BulkActionBar({ count, onComplete, onDelete, onMove, onClear, onExit, busy = false }: BulkActionBarProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);

  const item = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    danger = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.action, focus, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <AppText variant="caption" color={danger ? colors.danger : colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t("bulk.selected", { n: count })}
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: "#000",
        },
      ]}
    >
      <View style={styles.headerRow}>
        <AppText variant="label" weight="semibold">
          {t("bulk.selected", { n: count })}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onExit !== undefined ? t("bulk.exit") : t("bulk.clear")}
          onPress={onExit ?? onClear}
          hitSlop={8}
          style={({ pressed }) => [styles.closeHit, focus, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
        {item("checkmark-done-outline", t("bulk.complete"), onComplete)}
        {item("return-down-forward-outline", t("bulk.moveTo"), onMove)}
        {item("trash-outline", t("bulk.delete"), onDelete, true)}
        {item("close-circle-outline", t("bulk.clear"), onClear)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.xs,
    ...elevation.float,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeHit: {
    width: hit.min,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  action: {
    flex: 1,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.sm,
  },
});

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "../theme/AppText";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { showConfirm } from "./PromptHost";
import { t } from "../i18n";
import { radius, space } from "../theme/tokens";

export interface SavedFilterView {
  id: string;
  name: string;
}

export interface PerspectiveBarProps {
  perspectives: SavedFilterView[];
  activeId: string | null;
  onApply: (id: string) => void;
  onClearActive: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  /** 当前筛选是否与已保存的不同（否则不必显示保存入口） */
  canSave: boolean;
}

/**
 * 保存的筛选（Perspective）：一排胶囊，点应用，长按删除。
 * 没有保存项且不可保存时整条不渲染，避免空白占位。
 */
export function PerspectiveBar({
  perspectives,
  activeId,
  onApply,
  onClearActive,
  onSave,
  onDelete,
  canSave,
}: PerspectiveBarProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.pill);

  if (perspectives.length === 0 && !canSave) return null;

  const askDelete = async (entry: SavedFilterView) => {
    const ok = await showConfirm({
      title: t("perspective.delete"),
      message: entry.name,
      confirmLabel: t("common.delete"),
    });
    if (ok) onDelete(entry.id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      <View style={styles.labelWrap}>
        <Ionicons name="bookmark-outline" size={14} color={colors.textTertiary} />
      </View>
      {perspectives.map((entry) => {
        const selected = entry.id === activeId;
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={t("perspective.apply", { name: entry.name })}
            accessibilityHint={t("perspective.delete")}
            accessibilityState={{ selected }}
            onPress={() => (selected ? onClearActive() : onApply(entry.id))}
            onLongPress={() => void askDelete(entry)}
            delayLongPress={400}
            style={({ pressed }) => [
              styles.chip,
              focus,
              {
                backgroundColor: selected ? colors.primary : colors.surfaceMuted,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <AppText variant="caption" color={selected ? colors.onPrimary : colors.textSecondary} lines={1}>
              {entry.name}
            </AppText>
          </Pressable>
        );
      })}
      {canSave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("perspective.save")}
          onPress={onSave}
          style={({ pressed }) => [styles.chip, styles.saveChip, focus, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Ionicons name="add" size={13} color={colors.primary} />
          <AppText variant="caption" color={colors.primary} lines={1}>
            {t("perspective.save")}
          </AppText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.lg,
  },
  labelWrap: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    justifyContent: "center",
    maxWidth: 160,
  },
  saveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
});

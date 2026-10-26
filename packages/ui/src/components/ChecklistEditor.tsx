import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChecklistItem } from "@gtd/core";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { IconButton } from "../theme/primitives";
import { useT } from "../i18n";
import { radius, space } from "../theme/tokens";

export interface ChecklistEditorProps {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onAdd: (title: string) => void;
  onRemove: (id: string) => void;
}

/**
 * 清单子项：勾选 + 内联新增 + 删除。
 * 子项行固定 40 高，标题单行省略；顶部显示完成进度。
 */
export function ChecklistEditor({ items, onToggle, onAdd, onRemove }: ChecklistEditorProps) {
  const colors = useTheme();
  const t = useT();
  const [draft, setDraft] = useState("");

  const doneCount = items.filter((item) => item.done).length;

  const submit = () => {
    const title = draft.trim();
    if (title.length === 0) return;
    onAdd(title);
    setDraft("");
  };

  return (
    <View style={styles.wrap}>
      {items.length > 0 ? (
        <View style={styles.progressRow}>
          <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.round((doneCount / items.length) * 100)}%` as never,
                },
              ]}
            />
          </View>
          <AppText variant="caption" tone="tertiary" lines={1}>
            {doneCount}/{items.length}
          </AppText>
        </View>
      ) : null}

      {items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.title}
            onPress={() => onToggle(item.id)}
            hitSlop={6}
            style={styles.checkHit}
          >
            <View
              style={[
                styles.check,
                {
                  borderColor: item.done ? colors.primary : colors.borderStrong,
                  backgroundColor: item.done ? colors.primary : "transparent",
                },
              ]}
            >
              {item.done ? <Ionicons name="checkmark" size={12} color={colors.onPrimary} /> : null}
            </View>
          </Pressable>
          <AppText
            variant="label"
            lines={1}
            color={item.done ? colors.textTertiary : colors.text}
            style={item.done ? { ...styles.itemTitle, ...styles.itemDone } : styles.itemTitle}
          >
            {item.title}
          </AppText>
          <IconButton
            icon="close"
            size={15}
            tone="danger"
            onPress={() => onRemove(item.id)}
            accessibilityLabel={t("checklist.remove")}
          />
        </View>
      ))}

      <View style={[styles.addRow, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name="add" size={16} color={colors.textTertiary} />
        <TextInput
          accessibilityLabel={t("checklist.addPlaceholder")}
          placeholder={t("checklist.addPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="done"
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.addInput, { color: colors.text }]}
        />
        <IconButton
          icon="arrow-up-circle"
          size={18}
          onPress={submit}
          accessibilityLabel={t("checklist.add")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingBottom: space.xxs,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 4,
  },
  itemRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  checkHit: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
  },
  itemDone: {
    textDecorationLine: "line-through",
  },
  addRow: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xxs,
    borderRadius: radius.sm,
    marginTop: space.xxs,
  },
  addInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    height: 38,
    padding: 0,
  },
});

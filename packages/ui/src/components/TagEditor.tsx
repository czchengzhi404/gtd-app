import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { normalizeTag } from "@gtd/core";

import { AppText } from "../theme/AppText";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { hit, radius, space, type } from "../theme/tokens";

export interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** 可选的常用标签，点一下即添加 */
  suggestions?: string[];
  editable?: boolean;
}

/**
 * 标签编辑器：chips + 输入框。
 * 归一化交给 core 的 normalizeTag（去 #、压空白、限长），两端规则一致。
 */
export function TagEditor({ tags, onChange, suggestions = [], editable = true }: TagEditorProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag === "") return;
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((existing) => existing !== tag));
  };

  const unusedSuggestions = suggestions.filter(
    (candidate) => !tags.some((existing) => existing.toLowerCase() === candidate.toLowerCase()),
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.chips}>
        {tags.length === 0 ? (
          <AppText variant="caption" color={colors.textTertiary}>
            {t("tag.none")}
          </AppText>
        ) : null}
        {tags.map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: colors.primaryMuted, borderColor: colors.primary }]}>
            <AppText variant="caption" color={colors.primary} lines={1}>
              {`#${tag}`}
            </AppText>
            {editable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("tag.remove", { tag })}
                onPress={() => removeTag(tag)}
                hitSlop={6}
                style={({ pressed }) => [styles.removeHit, focus, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="close" size={12} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      {editable ? (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("tag.placeholder")}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel={t("tag.add")}
            returnKeyType="done"
            onSubmitEditing={() => addTag(draft)}
            onBlur={() => addTag(draft)}
            autoCapitalize="none"
            autoCorrect={false}
            allowFontScaling={false}
            style={[
              styles.input,
              focus,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted, fontSize: type.body.fontSize },
            ]}
          />
          {unusedSuggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {unusedSuggestions.slice(0, 8).map((candidate) => (
                <Pressable
                  key={candidate}
                  accessibilityRole="button"
                  accessibilityLabel={`#${candidate}`}
                  onPress={() => addTag(candidate)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    focus,
                    { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <AppText variant="caption" color={colors.textSecondary}>
                    {`#${candidate}`}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: space.sm,
    paddingRight: 2,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
  },
  removeHit: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  input: {
    minHeight: hit.min,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  suggestion: {
    minHeight: 36,
    paddingHorizontal: space.sm,
    justifyContent: "center",
    borderRadius: radius.pill,
  },
});

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { t, useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { radius, spacing } from "../tokens";

export interface QuickAddBarProps {
  /** 解析预览文本（调用方用 parseQuickAdd 生成，保持本组件纯粹） */
  preview?: string;
  placeholder?: string;
  onSubmit: (text: string) => void;
  submitting?: boolean;
}

/** 快速添加栏：文案随语言切换；提交有 loading 反馈 */
export function QuickAddBar({ preview, placeholder, onSubmit, submitting = false }: QuickAddBarProps) {
  const colors = useTheme();
  const t = useT();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || submitting) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.primary : colors.border,
          },
        ]}
      >
        <TextInput maxFontSizeMultiplier={1.2}
          accessibilityLabel={t("inbox.a11yQuickAdd")}
          accessibilityHint={t("inbox.a11yQuickAddHint")}
          placeholder={placeholder ?? t("inbox.quickAddPlaceholder")}
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          returnKeyType="done"
          editable={!submitting}
          multiline
          style={[styles.input, { color: colors.text }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("inbox.a11ySubmit")}
          disabled={submitting || text.trim().length === 0}
          onPress={submit}
          style={({ pressed }) => [
            styles.submit,
            {
              backgroundColor: colors.primary,
              opacity: submitting || text.trim().length === 0 ? 0.4 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text maxFontSizeMultiplier={1.2} style={[styles.submitText, { color: colors.onPrimary }]}>
            {submitting ? t("inbox.submitting") : t("common.add")}
          </Text>
        </Pressable>
      </View>
      {preview !== undefined && preview.length > 0 ? (
        <Text maxFontSizeMultiplier={1.2}
          accessibilityRole="text"
          accessibilityLabel={preview}
          style={[styles.preview, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {preview}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    maxHeight: 120,
  },
  submit: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "600",
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
});

// t 在非 hook 场景（预览等）可直接使用
void t;

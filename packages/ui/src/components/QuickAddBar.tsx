import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { t, useT } from "../i18n";
import { radius, space } from "../theme/tokens";

export interface QuickAddBarProps {
  /** 解析预览（由调用方用 parseQuickAdd 生成） */
  preview?: string;
  placeholder?: string;
  onSubmit: (text: string) => void;
  submitting?: boolean;
}

/**
 * 快速添加：单行输入 + 右侧「添加」按钮。
 * 输入框固定 44 高、字号固定、不随系统缩放；预览单独一行、单行省略，
 * 不会把页面结构往上顶。
 */
export function QuickAddBar({ preview, placeholder, onSubmit, submitting = false }: QuickAddBarProps) {
  const colors = useTheme();
  const tr = useT();
  const focus = useFocusStyle(radius.sm);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const empty = text.trim().length === 0;
  const submit = () => {
    if (empty || submitting) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.primary : colors.border,
          },
        ]}
      >
        <Ionicons name="add" size={18} color={colors.textTertiary} />
        <TextInput
          accessibilityLabel={tr("inbox.a11yQuickAdd")}
          accessibilityHint={tr("inbox.a11yQuickAddHint")}
          placeholder={placeholder ?? tr("inbox.quickAddPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          returnKeyType="done"
          editable={!submitting}
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.input, { color: colors.text }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("inbox.a11ySubmit")}
          accessibilityState={{ disabled: empty || submitting, busy: submitting }}
          disabled={empty || submitting}
          onPress={submit}
          style={({ pressed }) => [
            styles.submit,
            focus,
            { backgroundColor: empty ? colors.surfaceMuted : colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <AppText
            variant="label"
            weight="600"
            color={empty ? colors.textTertiary : colors.onPrimary}
            lines={1}
          >
            {submitting ? t("inbox.submitting") : tr("common.add")}
          </AppText>
        </Pressable>
      </View>
      {preview !== undefined && preview.length > 0 ? (
        <AppText variant="caption" tone="tertiary" lines={1} style={styles.preview}>
          {preview}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.xs,
  },
  field: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingLeft: space.md,
    paddingRight: space.xs,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    height: 44,
    padding: 0,
  },
  submit: {
    height: 34,
    minWidth: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    paddingHorizontal: space.xxs,
  },
});

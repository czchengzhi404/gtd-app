import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
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

const SYNTAX_ROWS: { syntaxKey: string; descKey: string }[] = [
  { syntaxKey: "qahelp.context", descKey: "qahelp.contextDesc" },
  { syntaxKey: "qahelp.project", descKey: "qahelp.projectDesc" },
  { syntaxKey: "qahelp.tag", descKey: "qahelp.tagDesc" },
  { syntaxKey: "qahelp.priority", descKey: "qahelp.priorityDesc" },
  { syntaxKey: "qahelp.date", descKey: "qahelp.dateDesc" },
  { syntaxKey: "qahelp.time", descKey: "qahelp.timeDesc" },
  { syntaxKey: "qahelp.repeat", descKey: "qahelp.repeatDesc" },
  { syntaxKey: "qahelp.waiting", descKey: "qahelp.waitingDesc" },
];

/** 语法速查弹层：让快捷输入的规则可被发现，而不是只藏在 placeholder 里 */
function QuickAddHelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const tr = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("qahelp.close")}
        style={[styles.helpBackdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
      <View style={styles.helpPos} pointerEvents="box-none">
        <View
          accessibilityRole="alert"
          accessibilityLabel={tr("qahelp.title")}
          style={[styles.helpCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <AppText variant="title" lines={1}>
            {tr("qahelp.title")}
          </AppText>
          <ScrollView style={styles.helpList} showsVerticalScrollIndicator>
            {SYNTAX_ROWS.map((row) => (
              <View key={row.syntaxKey} style={styles.helpRow}>
                <AppText variant="mono" color={colors.primary} style={styles.helpSyntax} lines={2}>
                  {tr(row.syntaxKey)}
                </AppText>
                <AppText variant="label" tone="secondary" lines={2} style={styles.helpDesc}>
                  {tr(row.descKey)}
                </AppText>
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("qahelp.close")}
            onPress={onClose}
            style={({ pressed }) => [
              styles.helpClose,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <AppText variant="label" weight="600" color={colors.onPrimary} lines={1}>
              {tr("qahelp.close")}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * 快速添加：单行输入 + 「?」语法速查 + 右侧「添加」按钮。
 * 输入框固定 44 高、字号固定、不随系统缩放；预览单独一行、单行省略，
 * 不会把页面结构往上顶。
 */
export function QuickAddBar({ preview, placeholder, onSubmit, submitting = false }: QuickAddBarProps) {
  const colors = useTheme();
  const tr = useT();
  const focus = useFocusStyle(radius.sm);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
          accessibilityLabel={tr("qahelp.open")}
          onPress={() => setHelpOpen(true)}
          hitSlop={6}
          style={({ pressed }) => [styles.helpHit, focus, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="help-circle-outline" size={18} color={colors.textTertiary} />
        </Pressable>
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
      <QuickAddHelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 880,
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
    fontSize: 16,
    height: 44,
    padding: 0,
  },
  helpHit: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
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
  helpBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  helpPos: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  helpCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "80%",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  helpList: {
    flexGrow: 0,
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.xs,
  },
  helpSyntax: {
    width: 150,
  },
  helpDesc: {
    flex: 1,
    minWidth: 0,
  },
  helpClose: {
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});

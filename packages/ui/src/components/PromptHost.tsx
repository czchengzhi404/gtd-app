import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { AppText } from "../theme/AppText";
import { Button } from "../theme/primitives";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { hit, radius, space, type } from "../theme/tokens";

export interface PromptRequest {
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 值校验：返回错误文案则阻止提交 */
  validate?: (value: string) => string | null;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface PromptState {
  request: PromptRequest | null;
  resolve: ((value: string | null) => void) | null;
  confirm: ConfirmRequest | null;
  confirmResolve: ((value: boolean) => void) | null;
}

const promptStore = createStore<PromptState>(() => ({
  request: null,
  resolve: null,
  confirm: null,
  confirmResolve: null,
}));

/**
 * 跨端文本输入对话框。
 *
 * 为什么不用 window.prompt / Alert.prompt：RN 原生（Android/iOS）两者都没有
 * window.prompt；Alert.prompt 仅 iOS 有。统一用 Modal + TextInput 才能三端一致，
 * 也才能给输入框加无障碍标签。
 */
export function showPrompt(request: PromptRequest): Promise<string | null> {
  const previous = promptStore.getState().resolve;
  // 前一个未决请求按取消处理，避免 Promise 永远悬挂
  previous?.(null);
  return new Promise<string | null>((resolve) => {
    promptStore.setState({ request, resolve });
  });
}

/**
 * 跨端确认对话框。
 * Alert.alert 在 react-native-web 上是空实现，删除类操作在桌面端会静默不执行，
 * 因此统一走 Modal。
 */
export function showConfirm(request: ConfirmRequest): Promise<boolean> {
  const previous = promptStore.getState().confirmResolve;
  previous?.(false);
  return new Promise<boolean>((resolve) => {
    promptStore.setState({ confirm: request, confirmResolve: resolve });
  });
}

/** 挂在根布局：全局唯一的输入/确认对话框宿主 */
export function PromptHost() {
  const request = useStore(promptStore, (state) => state.request);
  const confirm = useStore(promptStore, (state) => state.confirm);
  const colors = useTheme();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(request?.initialValue ?? "");
    setError(null);
  }, [request]);

  if (confirm !== null) {
    const closeConfirm = (result: boolean) => {
      const resolve = promptStore.getState().confirmResolve;
      promptStore.setState({ confirm: null, confirmResolve: null });
      resolve?.(result);
    };
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => closeConfirm(false)} statusBarTranslucent>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={() => closeConfirm(false)}
        />
        <View style={styles.center} pointerEvents="box-none">
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="title" lines={2}>
              {confirm.title}
            </AppText>
            {confirm.message !== undefined ? (
              <AppText variant="body" tone="secondary" lines={4}>
                {confirm.message}
              </AppText>
            ) : null}
            <View style={styles.actions}>
              <Button label={t("common.cancel")} variant="ghost" onPress={() => closeConfirm(false)} />
              <Button
                label={confirm.confirmLabel ?? t("common.delete")}
                variant={confirm.danger === false ? "primary" : "danger"}
                onPress={() => closeConfirm(true)}
              />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (request === null) return null;

  const close = (result: string | null) => {
    const resolve = promptStore.getState().resolve;
    promptStore.setState({ request: null, resolve: null });
    resolve?.(result);
  };

  const submit = () => {
    const trimmed = value.trim();
    const validation = request.validate?.(trimmed) ?? null;
    if (validation !== null) {
      setError(validation);
      return;
    }
    close(trimmed);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(null)} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={() => close(null)}
      />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="title" lines={2}>
            {request.title}
          </AppText>
          <TextInput
            value={value}
            onChangeText={(text) => {
              setValue(text);
              if (error !== null) setError(null);
            }}
            placeholder={request.placeholder}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel={request.title}
            autoFocus
            allowFontScaling={false}
            maxFontSizeMultiplier={1}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[
              styles.input,
              { color: colors.text, borderColor: error !== null ? colors.danger : colors.border, fontSize: type.body.fontSize },
            ]}
          />
          {error !== null ? (
            <AppText variant="caption" color={colors.danger} lines={2}>
              {error}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button label={t("common.cancel")} variant="ghost" onPress={() => close(null)} />
            <Button label={request.confirmLabel ?? t("common.save")} variant="primary" onPress={submit} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  input: {
    minHeight: hit.min,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
  },
});

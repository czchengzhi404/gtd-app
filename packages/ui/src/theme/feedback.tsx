import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { AppText } from "./AppText";
import { elevation, radius, space, zIndex } from "./tokens";
import { useTheme } from "../hooks/useTheme";
import { t } from "../i18n";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type ToastTone = "default" | "success" | "warning" | "danger" | "info";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** 提供 actionLabel 时 Toast 不自动消失，等待用户操作 */
  actionLabel?: string;
  onAction?: () => void;
  /** 自动消失时长（ms）；有 action 时忽略 */
  durationMs?: number;
}

interface ToastState {
  toast: (ToastOptions & { id: number }) | null;
}

const DEFAULT_DURATION = 3200;

/** 单例 toast store：同一时刻只保留最近一条（新的顶替旧的） */
export const toastStore = createStore<ToastState>(() => ({ toast: null }));

let toastSeq = 0;

/** 全局轻提示。任意页面可调用；宿主由根布局的 <ToastHost /> 提供。 */
export function showToast(options: ToastOptions): void {
  toastSeq += 1;
  toastStore.setState({ toast: { ...options, id: toastSeq } });
}

export function dismissToast(): void {
  toastStore.setState({ toast: null });
}

const TONE_ICON: Record<ToastTone, IoniconName> = {
  default: "information-circle-outline",
  success: "checkmark-circle-outline",
  warning: "alert-circle-outline",
  danger: "close-circle-outline",
  info: "information-circle-outline",
};

/**
 * Toast 宿主：挂在根布局最外层（与 UndoHost/PromptHost 同级）。
 *
 * 纪律：
 * - 同时最多 1 条（store 单槽）
 * - 无 action 时自动消失；有 action 时常驻，点 action 或关闭按钮消失
 * - 文本走 AppText；live region 用 polite（不打断读屏当前朗读）
 */
export function ToastHost({ bottomOffset = 76 }: { bottomOffset?: number }) {
  const toast = useStore(toastStore, (state) => state.toast);
  const colors = useTheme();

  useEffect(() => {
    if (toast === null) return undefined;
    if (toast.actionLabel !== undefined) return undefined;

    const timer = setTimeout(() => {
      if (toastStore.getState().toast?.id === toast.id) dismissToast();
    }, toast.durationMs ?? DEFAULT_DURATION);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  if (toast === null) return null;

  const fg = {
    default: colors.textSecondary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  }[toast.tone ?? "default"];

  const dismiss = () => {
    dismissToast();
  };

  const runAction = (action: (() => void) | undefined) => {
    if (action !== undefined) action();
    dismissToast();
  };

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View
        role="status"
        accessibilityLiveRegion="polite"
        accessibilityLabel={toast.message}
        style={[
          styles.bar,
          elevation.float,
          {
            backgroundColor: colors.surfaceOverlay,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name={TONE_ICON[toast.tone ?? "default"]} size={16} color={fg} />
        <AppText variant="label" color={colors.text} lines={2} style={styles.message}>
          {toast.message}
        </AppText>
        {toast.actionLabel !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            onPress={() => {
              runAction(toast.onAction);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
          >
            <AppText variant="label" weight="700" color={colors.primary} lines={1}>
              {toast.actionLabel}
            </AppText>
          </Pressable>
        ) : null}
        {toast.actionLabel !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("v2.toast.dismiss")}
            onPress={dismiss}
            hitSlop={10}
            style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 0.9 }]}
          >
            <Ionicons name="close" size={14} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: space.lg,
    zIndex: zIndex.toast,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    maxWidth: 560,
    width: "100%",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flex: 1,
    minWidth: 0,
  },
  action: {
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
  close: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});

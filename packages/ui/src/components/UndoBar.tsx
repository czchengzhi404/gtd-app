import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { elevation, radius, space } from "../theme/tokens";
import { t } from "../i18n";

interface Snack {
  id: number;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

let listeners = new Set<(snack: Snack | null) => void>();
let seq = 0;

/**
 * 展示一条可撤销提示（默认 5 秒）。
 * 供任意页面调用：删除任务/完成任务后立即撤销的入口。
 */
export function showUndo(message: string, onAction: () => void, actionLabel?: string): void {
  seq += 1;
  const snack: Snack = {
    id: seq,
    message,
    actionLabel: actionLabel ?? t("undo.action"),
    onAction,
  };
  for (const listener of listeners) listener(snack);
}

export function dismissUndo(): void {
  for (const listener of listeners) listener(null);
}

/**
 * 撤销条宿主：挂在根布局，浮在底部导航之上。
 * 组件自身管理显示时长；新的提示会顶替旧的（只保留最近一次操作）。
 */
export function UndoHost({ bottomOffset = 76 }: { bottomOffset?: number }) {
  const colors = useTheme();
  const [snack, setSnack] = useState<Snack | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener = (next: Snack | null) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setSnack(next);
      if (next !== null) {
        timerRef.current = setTimeout(() => setSnack(null), 5000);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  if (snack === null) return null;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View
        accessibilityRole="alert"
        accessibilityLabel={`${snack.message} ${snack.actionLabel}`}
        style={[styles.bar, elevation.float, { backgroundColor: colors.text }]}
      >
        <Ionicons name="checkmark-circle-outline" size={16} color={colors.canvas} />
        <AppText variant="label" color={colors.canvas} lines={1} style={styles.message}>
          {snack.message}
        </AppText>
        <AppText
          variant="label"
          weight="700"
          color={colors.primary}
          lines={1}
          onPress={() => {
            snack.onAction();
            setSnack(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={snack.actionLabel}
        >
          {snack.actionLabel}
        </AppText>
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
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    maxWidth: 560,
    width: "100%",
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  message: {
    flex: 1,
    minWidth: 0,
  },
});

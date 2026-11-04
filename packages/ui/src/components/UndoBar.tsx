import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Button, Divider } from "../theme/primitives";
import { elevation, radius, space } from "../theme/tokens";
import { Sheet } from "./Sheet";
import { t } from "../i18n";
import { peekUndo, popUndo, pruneUndo, pushUndo, type UndoEntry } from "../lib/undo-stack";
import { useKeyboardShortcuts } from "../platform/useKeyboardShortcuts";

/**
 * 全局撤销栈（模块级单例）。
 *
 * v2：从"只保留最近一次"升级为有界栈（10 条 / 60 秒 TTL，见 lib/undo-stack.ts）。
 * 连续删除/批量完成多条任务后可以连续 Ctrl+Z 逐层回退；
 * 点提示条上的「还可撤销 N 步」可打开历史面板，逐条查看并一次性回滚。
 */

let stack: UndoEntry[] = [];
let seq = 0;
let notify: ((entry: UndoEntry | null) => void) | null = null;

function visibleDepth(now: number): number {
  return pruneUndo(stack, now).length;
}

function emitLatest(): void {
  notify?.(peekUndo(stack, Date.now()));
}

/**
 * 展示一条可撤销提示（并入栈）。
 * 供任意页面调用：删除任务/完成任务后立即撤销的入口。
 */
export function showUndo(message: string, onAction: () => void, actionLabel?: string): void {
  seq += 1;
  stack = pushUndo(stack, {
    id: `undo-${String(seq)}`,
    message,
    actionLabel: actionLabel ?? t("undo.action"),
    run: onAction,
    createdAt: Date.now(),
  });
  emitLatest();
}

/** 只隐藏提示条，不丢弃栈（用户仍可用 Ctrl+Z） */
export function dismissUndo(): void {
  notify?.(null);
}

/**
 * 撤销最近一条操作。返回是否真的撤销了东西。
 * 撤销后自动展示下一条（如果还有），形成"连续回退"。
 */
export async function undoLast(): Promise<boolean> {
  const { entry, rest } = popUndo(stack, Date.now());
  stack = rest;
  if (entry === null) {
    notify?.(null);
    return false;
  }
  await entry.run();
  emitLatest();
  return true;
}

/** 一次性回滚所有未过期操作（从最新到最旧）；返回成功条数 */
export async function undoAll(): Promise<number> {
  let count = 0;
  for (;;) {
    const { entry, rest } = popUndo(stack, Date.now());
    if (entry === null) break;
    stack = rest;
    try {
      await entry.run();
      count += 1;
    } catch {
      // 单条回滚失败不阻断其余：可能对应记录已被同步删除
    }
  }
  notify?.(null);
  return count;
}

/** 撤销历史快照（最新在前），供历史面板展示 */
export function listUndo(now: number = Date.now()): UndoEntry[] {
  return [...pruneUndo(stack, now)].reverse();
}

/** 当前可撤销层数（测试/调试用；不触发渲染） */
export function undoDepth(now: number = Date.now()): number {
  return visibleDepth(now);
}

/** 清空撤销栈（切换账号/恢复备份后调用，避免撤销到旧库状态） */
export function clearUndoStack(): void {
  stack = [];
  notify?.(null);
}

/**
 * 撤销条宿主：挂在根布局，浮在底部导航之上。
 * 提示条 5 秒后收起，但栈保留；点「还可撤销 N 步」打开历史面板。
 */
export function UndoHost({ bottomOffset = 76 }: { bottomOffset?: number }) {
  const colors = useTheme();
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const [depth, setDepth] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener = (next: UndoEntry | null) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setEntry(next);
      setDepth(visibleDepth(Date.now()));
      if (next !== null) {
        // 提示条 5 秒后收起，但撤销栈仍保留（Ctrl+Z 可用）
        timerRef.current = setTimeout(() => setEntry(null), 5000);
      }
    };
    notify = listener;
    listener(peekUndo(stack, Date.now()));
    return () => {
      notify = null;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  useKeyboardShortcuts([{ key: "z", modifier: "ctrl" }], () => {
    void undoLast();
  });

  const openHistory = () => {
    setHistory(listUndo());
    setHistoryOpen(true);
  };

  const refreshHistory = () => {
    setHistory(listUndo());
    setDepth(visibleDepth(Date.now()));
  };

  return (
    <>
      {entry !== null ? (
        <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
          <View
            accessibilityRole="alert"
            accessibilityLabel={`${entry.message} ${entry.actionLabel}`}
            style={[styles.bar, elevation.float, { backgroundColor: colors.text }]}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.canvas} />
            <AppText variant="label" color={colors.canvas} lines={1} style={styles.message}>
              {entry.message}
            </AppText>
            {depth > 1 ? (
              <Pressable
                onPress={openHistory}
                accessibilityRole="button"
                accessibilityLabel={t("undo.history.open", { n: depth })}
                hitSlop={8}
              >
                <AppText variant="caption" color={colors.textTertiary} lines={1}>
                  {t("undo.depth", { n: depth })}
                </AppText>
              </Pressable>
            ) : null}
            <AppText
              variant="label"
              weight="700"
              color={colors.primary}
              lines={1}
              onPress={() => {
                void undoLast();
              }}
              accessibilityRole="button"
              accessibilityLabel={entry.actionLabel}
            >
              {entry.actionLabel}
            </AppText>
          </View>
        </View>
      ) : null}

      <Sheet
        visible={historyOpen}
        title={t("undo.history.title")}
        onClose={() => setHistoryOpen(false)}
        actions={
          <View style={styles.sheetActions}>
            <Button
              label={t("undo.history.undoOne")}
              variant="secondary"
              block
              disabled={history.length === 0}
              onPress={() => {
                void undoLast().then(() => {
                  refreshHistory();
                  if (listUndo().length === 0) setHistoryOpen(false);
                });
              }}
            />
            <Button
              label={t("undo.history.undoAll", { n: history.length })}
              variant="danger"
              block
              disabled={history.length === 0}
              onPress={() => {
                void undoAll().then(() => {
                  refreshHistory();
                  setHistoryOpen(false);
                });
              }}
            />
          </View>
        }
      >
        {history.length === 0 ? (
          <AppText variant="label" tone="tertiary" lines={2} style={styles.empty}>
            {t("undo.history.empty")}
          </AppText>
        ) : (
          <ScrollView style={styles.historyList} contentContainerStyle={styles.historyContent}>
            {history.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider variant="inset" /> : null}
                <View style={styles.historyRow}>
                  <View style={styles.historyText}>
                    <AppText variant="body" lines={2}>
                      {item.message}
                    </AppText>
                    <AppText variant="caption" tone="tertiary" lines={1}>
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </AppText>
                  </View>
                  <AppText variant="caption" tone="tertiary" lines={1}>
                    {index === 0 ? t("undo.history.latest") : ""}
                  </AppText>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <AppText variant="caption" tone="tertiary" lines={2} style={styles.hint}>
          {t("undo.history.hint")}
        </AppText>
      </Sheet>
    </>
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
  sheetActions: {
    gap: space.sm,
    width: "100%",
  },
  empty: {
    paddingVertical: space.xl,
    textAlign: "center",
  },
  historyList: {
    maxHeight: 320,
  },
  historyContent: {
    paddingVertical: space.xs,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  hint: {
    marginTop: space.sm,
  },
});

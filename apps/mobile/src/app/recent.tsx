import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  PageHeader,
  showToast,
  listUndo,
  space,
  undoAll,
  undoLast,
  useTheme,
  useT,
  type UndoEntry,
} from "@gtd/ui";

/**
 * 最近操作：把撤销栈里的 10 步可视化出来。
 *
 * 撤销按后进先出执行，所以这里不提供「删除中间某一步」——
 * 只给「撤销上一步」和「全部撤销」两个确定可解释的动作。
 */
export default function RecentScreen() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const t = useT();
  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setEntries(listUndo());
  }, []);

  useEffect(() => {
    refresh();
    // 撤销栈有 60 秒 TTL：页面停留时定期刷新，避免展示已失效的条目
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const onUndoOne = async () => {
    setBusy(true);
    try {
      const ok = await undoLast();
      refresh();
      if (ok) showToast({ message: t("undo.action"), tone: "success" });
    } finally {
      setBusy(false);
    }
  };

  const onUndoAll = async () => {
    setBusy(true);
    try {
      const count = await undoAll();
      refresh();
      showToast({ message: t("undo.history.undoAll", { n: count }), tone: "success" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <PageHeader title={t("app.more.recent")} subtitle={t("app.more.recentHint")} />
      {entries.length === 0 ? (
        <EmptyState
          title={t("undo.history.empty")}
          hint={t("undo.history.hint")}
          illustration="done"
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card variant="outline" padding="none">
              {entries.map((entry, index) => (
                <View key={entry.id}>
                  {index > 0 ? <Divider inset={space.lg} /> : null}
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <AppText variant="body" lines={2}>
                        {entry.message}
                      </AppText>
                      <AppText variant="caption" tone="tertiary" lines={1}>
                        {new Date(entry.createdAt).toLocaleTimeString()}
                        {index === 0 ? ` · ${t("undo.history.latest")}` : ""}
                      </AppText>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
            <AppText variant="caption" tone="tertiary" lines={2} style={styles.hint}>
              {t("undo.history.hint")}
            </AppText>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + space.md }]}>
            <Button
              label={t("undo.history.undoOne")}
              variant="secondary"
              icon="arrow-undo-outline"
              disabled={busy}
              onPress={() => void onUndoOne()}
            />
            <Button
              label={t("undo.history.undoAll", { n: entries.length })}
              variant="primary"
              disabled={busy}
              onPress={() => void onUndoAll()}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    gap: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  hint: {
    paddingHorizontal: space.xs,
  },
  footer: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

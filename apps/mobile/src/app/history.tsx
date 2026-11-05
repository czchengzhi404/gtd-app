import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
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
  space,
  useTheme,
  useT,
} from "@gtd/ui";
import { getSqliteExecutor, listNoteVersions, runCommand } from "@gtd/core";
import type { NoteVersion } from "@gtd/core";

/**
 * 正文版本历史：列出该任务最近 20 个版本，可一键恢复。
 *
 * 版本在 `task.update` 写入新正文**之前**自动保存（见 `db/note-versions.ts`），
 * 所以"恢复某一版"本身也会产生一条新版本 —— 这是有意的，避免回滚后无法再回滚。
 */
export default function HistoryScreen() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const t = useT();
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [busy, setBusy] = useState(false);

  const targetId = typeof taskId === "string" ? taskId : "";

  const load = useCallback(async () => {
    if (targetId.length === 0) {
      setVersions([]);
      return;
    }
    const list = await listNoteVersions(getSqliteExecutor(), targetId).catch(() => []);
    setVersions(list);
  }, [targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (version: NoteVersion) => {
    if (targetId.length === 0) return;
    setBusy(true);
    try {
      await runCommand("task.update", { id: targetId, patch: { notes: version.content } });
      showToast({ message: t("history.restored"), tone: "success" });
      if (router.canGoBack()) router.back();
      else router.navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ message: t("history.restoreFailed", { message }), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />
      {versions === null ? null : versions.length === 0 ? (
        <EmptyState title={t("history.empty")} hint={t("history.emptyHint")} illustration="done" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {versions.map((version, index) => (
            <Card key={version.id} padding="normal">
              <View style={styles.row}>
                <View style={styles.text}>
                  <AppText variant="label" weight="semibold" lines={1}>
                    {new Date(version.createdAt).toLocaleString()}
                    {index === 0 ? ` · ${t("history.latest")}` : ""}
                  </AppText>
                  <AppText variant="caption" tone="tertiary" lines={1}>
                    {t("history.meta", { n: version.wordCount })}
                  </AppText>
                </View>
                <Button
                  label={t("history.restore")}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() => void restore(version)}
                />
              </View>
              <Divider />
              <AppText variant="body" tone="secondary" lines={4}>
                {version.content.slice(0, 240)}
                {version.content.length > 240 ? "…" : ""}
              </AppText>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    gap: space.sm,
    paddingBottom: space.xxxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingBottom: space.xs,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});

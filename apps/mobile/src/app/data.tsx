import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppText,
  Button,
  Card,
  OptionSheet,
  PageHeader,
  Screen,
  SectionHeader,
  SegmentedControl,
  showConfirm,
  showToast,
  useT,
  space,
} from "@gtd/ui";
import { getSqliteExecutor, getSyncConfig } from "@gtd/core";
import type { SyncConfig } from "@gtd/core";
import {
  backupCount,
  backupNow,
  backupToCloud,
  decryptSecret,
  importFromFile,
  restoreLatestBackup,
} from "@/platform/desktop-actions";
import { exportBackupJSON, exportICS, exportMarkdown } from "@/platform/export-actions";
import type { ExportKind, SaveTarget } from "@/platform/export-actions";
import { isDesktop } from "@/platform/env";

/**
 * 数据与记录：导出 / 导入 / 本地备份 / 云备份。
 *
 * 这些动作都是「偶尔做一次、但失败代价高」的操作，从「更多」独立成页后
 * 可以完整铺开说明文字，不必和主题、语言抢首屏。
 */
export default function DataScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();

  const [config, setConfig] = useState<SyncConfig>({
    kind: "webdav",
    endpoint: "",
    username: "",
    password: "",
    enabled: false,
    bucket: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [exportSheetKind, setExportSheetKind] = useState<ExportKind | null>(null);
  // Markdown 导出范围：默认只导未完成；写作者归档已完成的稿子时需要"含已完成"
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [backups, setBackups] = useState(0);

  useEffect(() => {
    void (async () => {
      // 云备份复用同步配置：这里只读取，不提供编辑入口（编辑在「更多 → 同步」）
      const saved = await getSyncConfig(getSqliteExecutor());
      if (saved !== null) {
        if (isDesktop()) {
          if (saved.password) saved.password = await decryptSecret(saved.password);
          if (saved.secretAccessKey) saved.secretAccessKey = await decryptSecret(saved.secretAccessKey);
        }
        setConfig(saved);
      }
      setBackups(await backupCount());
    })();
  }, []);

  const flash = (message: string, tone: "success" | "danger" | "info" | "warning") => {
    setStatus(message);
    showToast({ message, tone });
  };

  /**
   * 文本导出：桌面直接弹保存对话框；移动端先让用户选「保存到手机」还是「分享出去」。
   * 保存走 SAF（文件真在文件管理器里），分享走系统分享面板。
   */
  const startTextExport = (kind: ExportKind) => {
    if (isDesktop()) {
      void runTextExport(kind, "save");
      return;
    }
    setExportSheetKind(kind);
  };

  const runTextExport = async (kind: ExportKind, target: SaveTarget) => {
    setBusy(true);
    try {
      const result =
        kind === "markdown"
          ? await exportMarkdown(target, includeCompleted)
          : kind === "ics"
            ? await exportICS(target)
            : await exportBackupJSON(target);
      if (result === null) {
        flash(t("app.more.exportCanceled"), "info");
        return;
      }
      flash(
        result.mode === "saved"
          ? t("app.more.exportSaved", { name: result.fileName })
          : t("app.more.exportShared", { name: result.fileName }),
        "success",
      );
    } catch (err) {
      flash(
        t("app.more.exportFailed", { message: err instanceof Error ? err.message : String(err) }),
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    setStatus(t("more.status.importing"));
    try {
      setStatus(await importFromFile());
    } catch (err) {
      flash(
        t("more.status.importFailed") + (err instanceof Error ? err.message : String(err)),
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const onBackup = async () => {
    setBusy(true);
    try {
      const outcome = await backupNow();
      setStatus(outcome.message);
      setBackups(await backupCount());
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    const ok = await showConfirm({
      title: t("more.backupSection"),
      message: t("more.backupConfirm"),
      confirmLabel: t("more.backupRestore"),
      danger: true,
    });
    if (!ok) return;
    const outcome = await restoreLatestBackup();
    setStatus(outcome.message);
    showToast({ message: outcome.message, tone: outcome.ok ? "success" : "danger" });
  };

  const onCloudBackup = async () => {
    if (!config.enabled) {
      flash(t("app.more.cloudNeedsConfig"), "warning");
      return;
    }
    setBusy(true);
    try {
      const outcome = await backupToCloud(config);
      flash(outcome.ok ? t("app.more.cloudBackupDone", { file: outcome.message }) : outcome.message, outcome.ok ? "success" : "danger");
    } catch (err) {
      flash(
        t("app.more.exportFailed", { message: err instanceof Error ? err.message : String(err) }),
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {/* Stack header 已隐藏（见 _layout.tsx）：自绘标题要自己顶开状态栏 */}
      <View style={{ paddingTop: insets.top }}>
        <PageHeader
          title={t("more.group.data")}
          onBack={() => router.back()}
          backLabel={t("app.common.back")}
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
      >
        <View style={styles.column}>
          {/* 导出 / 导入 */}
          <SectionHeader title={t("more.dataSection")} />
          <Card variant="outline" padding="normal" style={styles.card}>
            <View style={styles.buttonRow}>
              <Button
                label={t("app.more.exportJSON")}
                icon="download-outline"
                size="sm"
                disabled={busy}
                onPress={() => startTextExport("json")}
              />
              <Button
                label={t("app.more.exportMarkdown")}
                icon="document-text-outline"
                size="sm"
                disabled={busy}
                onPress={() => startTextExport("markdown")}
              />
            </View>
            <SegmentedControl<"open" | "all">
              accessibilityLabel={t("app.more.exportScope")}
              value={includeCompleted ? "all" : "open"}
              onChange={(key) => setIncludeCompleted(key === "all")}
              items={[
                { key: "open", label: t("app.more.exportScopeOpen") },
                { key: "all", label: t("app.more.exportScopeAll") },
              ]}
            />
            <View style={styles.buttonRow}>
              <Button
                label={t("app.more.exportICS")}
                icon="calendar-outline"
                size="sm"
                disabled={busy}
                onPress={() => startTextExport("ics")}
              />
              <Button
                label={t("app.more.importJSON")}
                icon="cloud-upload-outline"
                size="sm"
                disabled={busy}
                onPress={() => void onImport()}
              />
            </View>
            <View style={styles.buttonRow}>
              <Button
                label={t("app.more.importText")}
                icon="document-attach-outline"
                size="sm"
                disabled={busy}
                onPress={() => router.push("/import")}
              />
            </View>
          </Card>

          {/* 本地备份 */}
          <SectionHeader title={t("app.more.localBackup")} />
          <Card variant="outline" padding="normal" style={styles.card}>
            <View style={styles.buttonRow}>
              <Button
                label={t("more.backupNow")}
                icon="save-outline"
                size="sm"
                disabled={busy}
                onPress={() => void onBackup()}
              />
              <Button
                label={t("more.backupRestore")}
                icon="time-outline"
                size="sm"
                variant="danger"
                disabled={busy || backups === 0}
                onPress={() => void onRestore()}
              />
            </View>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {backups > 0 ? t("more.backupList", { n: backups }) : t("more.backupNever")}
            </AppText>
          </Card>

          {/* 云备份 */}
          <SectionHeader title={t("app.more.cloudBackup")} />
          <Card variant="outline" padding="normal" style={styles.card}>
            <Button
              label={t("app.more.cloudBackupNow")}
              icon="cloud-done-outline"
              size="sm"
              disabled={busy}
              onPress={() => void onCloudBackup()}
            />
            <AppText variant="caption" tone="tertiary" lines={2}>
              {t("app.more.cloudBackupHint")}
            </AppText>
          </Card>

          {status.length > 0 ? (
            <AppText variant="label" tone="secondary" lines={3} style={styles.status}>
              {status}
            </AppText>
          ) : null}
        </View>
      </ScrollView>

      <OptionSheet
        visible={exportSheetKind !== null}
        title={t("app.more.exportTarget")}
        options={[
          { key: "save", label: t("app.more.exportTargetSave") },
          { key: "share", label: t("app.more.exportTargetShare") },
        ]}
        onSelect={(key) => {
          const kind = exportSheetKind;
          setExportSheetKind(null);
          if (kind !== null) void runTextExport(kind, key as SaveTarget);
        }}
        onClose={() => setExportSheetKind(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.sm,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  card: {
    marginHorizontal: space.lg,
    gap: space.sm,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  status: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
});

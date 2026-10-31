import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  AppText,
  Button,
  Card,
  Divider,
  useAppStore,
  useTheme,
  useT,
  setLang,
  getLang,
} from "@gtd/ui";
import { getSyncConfig, getSqliteExecutor, getWaitingTasks, getSomedayTasks, runCommand } from "@gtd/core";
import type { SyncConfig } from "@gtd/core";
import {
  backupCount,
  backupNow,
  decryptSecret,
  exportAllToFile,
  importFromFile,
  pickSyncFolder,
  restoreLatestBackup,
  runManualSync,
  saveSyncConfig,
  testSyncConnection,
} from "@/platform/desktop-actions";
import { isDesktop } from "@/platform/env";
import { exportOnMobile } from "@/platform/mobile-actions";
import { ensureBuiltinFont } from "@/platform/font-loader";

/** 同步预设：坚果云/WebDAV/S3/本地文件夹（坚果云本质走 WebDAV，endpoint 已预填） */
interface SyncPreset {
  key: string;
  /** SyncConfig.kind */
  kind: SyncConfig["kind"];
  labelKey: string;
  hintKey: string;
  endpointTemplate?: string;
  desktopOnly?: boolean;
  showBucket?: boolean;
  showRegion?: boolean;
}

const SYNC_PRESETS: SyncPreset[] = [
  { key: "nutstore", kind: "webdav", labelKey: "preset.nutstore", hintKey: "preset.nutstoreHint", endpointTemplate: "https://dav.jianguoyun.com/dav/" },
  { key: "webdav", kind: "webdav", labelKey: "preset.customWebdav", hintKey: "preset.customWebdavHint" },
  { key: "s3", kind: "s3", labelKey: "preset.s3", hintKey: "preset.s3Hint", showBucket: true, showRegion: true },
  { key: "folder", kind: "folder", labelKey: "preset.folder", hintKey: "preset.folderHint", desktopOnly: true },
];

/** 更多：等待中/将来也许预览、语言、每周回顾入口、同步设置、数据导入导出 */
export default function MoreScreen() {
  const waiting = useAppStore(getWaitingTasks);
  const someday = useAppStore(getSomedayTasks);
  const kv = useAppStore((s) => s.kv);
  const loaded = useAppStore((s) => s.loaded);
  const colors = useTheme();
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
  const [lang, setLangUi] = useState(getLang());
  const [backups, setBackups] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState("nutstore");
  const [testing, setTesting] = useState(false);

  const syncLog = useMemo(() => {
    const raw = kv["sync.log"];
    if (raw === undefined) return null;
    try {
      const parsed = JSON.parse(raw) as {
        applied?: number;
        localWins?: number;
        remoteWins?: number;
        conflicts?: { label: string }[];
      };
      return {
        applied: parsed.applied ?? 0,
        localWins: parsed.localWins ?? 0,
        remoteWins: parsed.remoteWins ?? 0,
        conflicts: parsed.conflicts ?? [],
      };
    } catch {
      return null;
    }
  }, [kv]);

  useEffect(() => {
    void (async () => {
      const saved = await getSyncConfig(getSqliteExecutor());
      if (saved !== null) {
        // 解密敏感字段（桌面端 safeStorage）
        if (isDesktop()) {
          if (saved.password) saved.password = await decryptSecret(saved.password);
          if (saved.secretAccessKey) saved.secretAccessKey = await decryptSecret(saved.secretAccessKey);
        }
        setConfig(saved);
      }
      setBackups(await backupCount());
    })();
  }, []);

  if (!loaded) return null;

  const lastSync =
    kv["sync.last"] !== undefined
      ? new Date(Number(kv["sync.last"])).toLocaleString()
      : t("more.lastSyncNever");
  const lastReview =
    kv["review.lastAt"] !== undefined
      ? new Date(Number(kv["review.lastAt"])).toLocaleDateString()
      : t("more.reviewNever");
  // 距上次回顾 ≥7 天（或从未回顾）时提示，红点只出现在 More 页，不做全局打扰
  const reviewDue =
    kv["review.lastAt"] === undefined || Date.now() - Number(kv["review.lastAt"]) >= 7 * 86400000;

  const update = (patch: Partial<SyncConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const onSwitchLang = (next: "zh" | "en") => {
    setLang(next);
    setLangUi(next);
    void runCommand("settings.set", { key: "lang", value: next }).catch(() => undefined);
  };

  const onSyncNow = async () => {
    setBusy(true);
    setStatus(t("more.status.syncing"));
    try {
      const outcome = await runManualSync();
      setStatus(outcome.message);
    } catch (err) {
      setStatus(t("more.status.syncFailed") + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const onPickFolder = async () => {
    const dir = await pickSyncFolder();
    if (dir !== null) update({ endpoint: dir, kind: "folder" });
  };

  const onSave = async () => {
    setBusy(true);
    try {
      await saveSyncConfig(config);
      setStatus(t("more.status.saved"));
    } catch (err) {
      setStatus(t("more.status.saveFailed") + (err instanceof Error ? err.message : String(err)));
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

  const onRestore = () => {
    Alert.alert(t("more.backupSection"), t("more.backupConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("more.backupRestore"),
        style: "destructive",
        onPress: () => {
          void restoreLatestBackup().then((outcome) => setStatus(outcome.message));
        },
      },
    ]);
  };

  const onTestConnection = async () => {
    setTesting(true);
    try {
      const outcome = await testSyncConnection(config);
      setStatus(outcome.message);
    } catch (err) {
      setStatus(t("sync.testFailed") + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTesting(false);
    }
  };

  const onExport = async () => {
    setBusy(true);
    try {
      if (isDesktop()) {
        const target = await exportAllToFile();
        setStatus(target === null ? t("more.status.canceled") : t("more.status.exported") + target);
      } else {
        // 移动端：系统分享面板导出（此前导出/备份是桌面专属，手机用户没有数据出口）
        await exportOnMobile();
        setStatus(t("more.status.exported") + t("more.exportMobileDone"));
      }
    } catch (err) {
      setStatus(t("more.status.exportFailed") + (err instanceof Error ? err.message : String(err)));
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
      setStatus(t("more.status.importFailed") + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.canvas }}>
      <View style={styles.column}>
        {/* 任务状态：等待中 / 将来也许 */}
        <GroupCard icon="layers-outline" title={t("more.group.status")}>
          <View style={styles.subHeaderRow}>
            <AppText variant="caption" tone="secondary" lines={1}>
              {t("more.waiting")}
            </AppText>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {String(waiting.length)}
            </AppText>
          </View>
          {waiting.length === 0 ? (
            <AppText variant="label" tone="tertiary" lines={1} style={styles.groupEmpty}>
              {t("more.waitingEmpty")}
            </AppText>
          ) : (
            waiting.slice(0, 3).map((task) => (
              <PreviewRow
                key={task.id}
                title={task.title}
                sub={task.waitingFor !== null ? t("more.waitingFor", { who: task.waitingFor }) : undefined}
                onPress={() => router.push(`/task/${task.id}`)}
              />
            ))
          )}
          <Divider style={styles.groupDivider} />
          <View style={styles.subHeaderRow}>
            <AppText variant="caption" tone="secondary" lines={1}>
              {t("more.someday")}
            </AppText>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {String(someday.length)}
            </AppText>
          </View>
          {someday.length === 0 ? (
            <AppText variant="label" tone="tertiary" lines={1} style={styles.groupEmpty}>
              {t("more.somedayEmpty")}
            </AppText>
          ) : (
            someday.slice(0, 3).map((task) => (
              <PreviewRow
                key={task.id}
                title={task.title}
                onPress={() => router.push(`/task/${task.id}`)}
              />
            ))
          )}
        </GroupCard>

        {/* 外观：语言 / 主题 / 字体 */}
        <GroupCard icon="color-palette-outline" title={t("more.appearance")}>
          <AppText variant="caption" tone="tertiary" lines={1} style={styles.subLabel}>
            {t("more.language")}
          </AppText>
          <View style={styles.pillRow}>
            <SegPill label={t("more.lang.zh")} selected={lang === "zh"} onPress={() => onSwitchLang("zh")} />
            <SegPill label={t("more.lang.en")} selected={lang === "en"} onPress={() => onSwitchLang("en")} />
          </View>
          <AppText variant="caption" tone="tertiary" lines={1} style={styles.subLabel}>
            {t("more.themeSection")}
          </AppText>
          <View style={styles.pillRow}>
            <SegPill label={t("more.theme.system")} selected={(kv["theme.mode"] ?? "system") === "system"} onPress={() => void runCommand("settings.set", { key: "theme.mode", value: "system" }).catch(() => undefined)} />
            <SegPill label={t("more.theme.light")} selected={kv["theme.mode"] === "light"} onPress={() => void runCommand("settings.set", { key: "theme.mode", value: "light" }).catch(() => undefined)} />
            <SegPill label={t("more.theme.dark")} selected={kv["theme.mode"] === "dark"} onPress={() => void runCommand("settings.set", { key: "theme.mode", value: "dark" }).catch(() => undefined)} />
          </View>
          <AppText variant="caption" tone="tertiary" lines={1} style={styles.subLabel}>
            {t("more.fontSection")}
          </AppText>
          <View style={styles.pillRow}>
            <SegPill label={t("more.font.wenkai")} selected={(kv["font.family"] ?? "system") === "LXGWWenKai"} onPress={() => void ensureBuiltinFont().then(() => runCommand("settings.set", { key: "font.family", value: "LXGWWenKai" }).catch(() => undefined)).catch(() => undefined)} />
            <SegPill label={t("more.font.system")} selected={(kv["font.family"] ?? "system") === "system"} onPress={() => void runCommand("settings.set", { key: "font.family", value: "system" }).catch(() => undefined)} />
          </View>
        </GroupCard>

        {/* 每周回顾 */}
        <GroupCard
          icon="refresh-circle-outline"
          title={t("more.reviewSection")}
          trailing={
            reviewDue ? (
              <AppText variant="caption" color={colors.danger} lines={1}>
                ● {t("review.dueBadge")}
              </AppText>
            ) : (
              <AppText variant="caption" tone="tertiary" lines={1}>
                {lastReview}
              </AppText>
            )
          }
        >
          <Button
            label={t("more.reviewStart")}
            icon="refresh-circle-outline"
            variant="primary"
            block
            onPress={() => router.push("/review")}
          />
        </GroupCard>

        {/* 同步（可选） */}
        <GroupCard icon="cloudy-outline" title={t("more.syncSection")}>
          {/* 预设选择 */}
          <View style={styles.inlineRow}>
            {SYNC_PRESETS.map((preset) => (
              <SegPill
                key={preset.key}
                label={t(preset.labelKey)}
                selected={selectedPreset === preset.key}
                disabled={preset.desktopOnly === true && !isDesktop()}
                onPress={() => {
                  setSelectedPreset(preset.key);
                  update({
                    kind: preset.kind,
                    ...(preset.endpointTemplate !== undefined ? { endpoint: preset.endpointTemplate } : {}),
                  });
                }}
              />
            ))}
          </View>
          <AppText variant="caption" tone="tertiary" lines={3} style={styles.hintText}>
            {t(SYNC_PRESETS.find((p) => p.key === selectedPreset)?.hintKey ?? "preset.nutstoreHint")}
          </AppText>

          {/* 字段 */}
          {selectedPreset === "folder" ? (
            <Button
              label={t("more.pickFolder")}
              icon="folder-open-outline"
              disabled={busy || !isDesktop()}
              block
              onPress={() => void onPickFolder()}
            />
          ) : (
            <>
              <Field
                label={t("more.server")}
                value={config.endpoint}
                onChangeText={(text) => update({ endpoint: text })}
                placeholder={selectedPreset === "s3" ? "https://oss-cn-hangzhou.aliyuncs.com" : "https://dav.example.com/gtd/"}
              />
              {selectedPreset === "s3" ? (
                <>
                  <Field label={t("sync.bucket")} value={config.bucket ?? ""} onChangeText={(text) => update({ bucket: text })} />
                  <Field label={t("sync.region")} value={config.region ?? ""} onChangeText={(text) => update({ region: text })} />
                  <Field label={t("sync.accessKeyId")} value={config.accessKeyId ?? ""} onChangeText={(text) => update({ accessKeyId: text })} />
                  <Field
                    label={t("sync.secretAccessKey")}
                    value={config.secretAccessKey ?? ""}
                    onChangeText={(text) => update({ secretAccessKey: text })}
                    secureTextEntry
                  />
                </>
              ) : (
                <>
                  <Field label={t("more.username")} value={config.username ?? ""} onChangeText={(text) => update({ username: text })} />
                  <Field
                    label={t("more.password")}
                    value={config.password ?? ""}
                    onChangeText={(text) => update({ password: text })}
                    secureTextEntry
                  />
                </>
              )}
            </>
          )}

          {/* 操作 */}
          <View style={styles.inlineRow}>
            <SegPill
              label={config.enabled ? t("more.enabled") : t("more.disabled")}
              selected={config.enabled}
              onPress={() => update({ enabled: !config.enabled })}
            />
            <Button label={t("more.saveConfig")} disabled={busy} onPress={() => void onSave()} />
            <Button label={t("more.syncNow")} variant="primary" disabled={busy} onPress={() => void onSyncNow()} />
            <Button
              label={testing ? t("sync.testing") : t("sync.testConnection")}
              icon="wifi-outline"
              disabled={busy}
              onPress={() => void onTestConnection()}
            />
          </View>

          <AppText variant="caption" tone="tertiary" lines={1}>
            {t("more.lastSync")}
            {lastSync}
          </AppText>
          <Divider style={styles.groupDivider} />
          {/* 同步日志 */}
          {syncLog === null ? (
            <AppText variant="label" tone="tertiary" lines={1}>
              {t("more.syncLogEmpty")}
            </AppText>
          ) : (
            <>
              <AppText variant="label" tone="secondary" lines={2}>
                {t("more.syncLogSummary", {
                  applied: syncLog.applied,
                  local: syncLog.localWins,
                  remote: syncLog.remoteWins,
                })}
              </AppText>
              {syncLog.conflicts.length > 0 ? (
                <>
                  <AppText variant="caption" tone="tertiary" lines={1}>
                    {t("more.syncLogConflicts")}
                  </AppText>
                  {syncLog.conflicts.slice(0, 5).map((conflict, index) => (
                    <AppText key={`${conflict.label}-${index}`} variant="caption" tone="tertiary" lines={1}>
                      {`· ${conflict.label}`}
                    </AppText>
                  ))}
                </>
              ) : null}
            </>
          )}
        </GroupCard>

        {/* 本地备份（桌面端） */}
        {isDesktop() ? (
          <GroupCard
            icon="save-outline"
            title={t("more.backupSection")}
            trailing={
              <AppText variant="caption" tone="tertiary" lines={1}>
                {backups > 0 ? t("more.backupList", { n: backups }) : t("more.backupNever")}
              </AppText>
            }
          >
            <Button
              label={t("more.backupNow")}
              icon="save-outline"
              disabled={busy}
              block
              onPress={() => void onBackup()}
            />
            <View style={styles.gap} />
            <Button
              label={t("more.backupRestore")}
              icon="time-outline"
              variant="danger"
              disabled={busy || backups === 0}
              block
              onPress={onRestore}
            />
          </GroupCard>
        ) : null}

        {/* 数据与记录 */}
        <GroupCard icon="server-outline" title={t("more.group.data")}>
          <Button
            label={t("more.completedEntry")}
            icon="checkmark-done-outline"
            block
            onPress={() => router.push("/completed")}
          />
          <View style={styles.gap} />
          <Button
            label={t("more.trashEntry")}
            icon="trash-outline"
            block
            onPress={() => router.push("/trash")}
          />
          <Divider style={styles.groupDivider} />
          <Button
            label={t("more.export")}
            icon="download-outline"
            disabled={busy}
            block
            onPress={() => void onExport()}
          />
          <View style={styles.gap} />
          <Button
            label={t("more.import")}
            icon="cloud-upload-outline"
            disabled={busy}
            block
            onPress={() => void onImport()}
          />
        </GroupCard>

        {/* 关于 */}
        <GroupCard icon="information-circle-outline" title={t("more.about")}>
          <Button label={t("more.about")} icon="information-circle-outline" block onPress={() => router.push("/about")} />
        </GroupCard>

        {status.length > 0 ? (
          <AppText variant="label" tone="secondary" lines={3} style={styles.status}>
            {status}
          </AppText>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** 分组卡片：图标 + 标题 + 行尾信息 + 内容，More 页的信息架构单元 */
function GroupCard({
  icon,
  title,
  trailing,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const colors = useTheme();
  return (
    <Card style={styles.group}>
      <View style={styles.groupHeader}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <AppText variant="label" weight="600" lines={1} style={styles.groupTitle}>
          {title}
        </AppText>
        {trailing ?? null}
      </View>
      {children}
    </Card>
  );
}

function PreviewRow({ title, sub, onPress }: { title: string; sub?: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.previewRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="ellipse" size={6} color={colors.textTertiary} />
      <AppText variant="label" lines={1} style={styles.previewTitle}>
        {title}
      </AppText>
      {sub !== undefined ? (
        <AppText variant="caption" tone="tertiary" lines={1}>
          {sub}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function SegPill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? colors.primary : colors.surfaceMuted,
          opacity: disabled === true ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppText
        variant="label"
        weight="600"
        color={selected ? colors.onPrimary : colors.textSecondary}
        lines={1}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.field}>
      <AppText variant="caption" tone="tertiary" lines={1}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[
          styles.input,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
    gap: 12,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  group: {
    marginHorizontal: 16,
    gap: 8,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  groupTitle: {
    flex: 1,
    minWidth: 0,
  },
  subHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  subLabel: {
    marginTop: 4,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  groupEmpty: {
    paddingVertical: 2,
  },
  groupDivider: {
    marginVertical: 8,
  },
  block: {
    marginHorizontal: 16,
  },
  gap: {
    height: 8,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
  },
  pill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    justifyContent: "center",
  },
  previewRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewTitle: {
    flex: 1,
    minWidth: 0,
  },
  field: {
    gap: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  status: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

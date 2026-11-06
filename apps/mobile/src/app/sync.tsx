import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  AppText,
  Button,
  Card,
  Divider,
  SectionHeader,
  showToast,
  useAppStore,
  useTheme,
  useT,
  radius,
  space,
} from "@gtd/ui";
import { getSyncConfig } from "@gtd/core";
import type { PeerDeviceInfo, SyncConfig } from "@gtd/core";
import {
  listPeerDevices,
  pickSyncFolder,
  resolveSyncConfig,
  runManualSync,
  saveSyncConfig,
  testSyncConnection,
} from "@/platform/desktop-actions";
import { isDesktop } from "@/platform/env";

/**
 * 同步设置页（独立页面）。
 *
 * 为什么单独成页：原先同步配置是「更多」页里第 5 个分组、且默认折叠——
 * 手机上要滚过四组才看得到，用户会以为「同步只有电脑端有」。
 *
 * 移动端支持 WebDAV（坚果云）/ 自托管 HTTP / S3；「本地文件夹」需要 FilesPort，仅桌面端。
 */

interface SyncPreset {
  key: string;
  kind: SyncConfig["kind"];
  labelKey: string;
  hintKey: string;
  endpointTemplate?: string;
  desktopOnly?: boolean;
  showBucket?: boolean;
  showRegion?: boolean;
}

const SYNC_PRESETS: SyncPreset[] = [
  {
    key: "nutstore",
    kind: "webdav",
    labelKey: "preset.nutstore",
    hintKey: "preset.nutstoreHint",
    endpointTemplate: "https://dav.jianguoyun.com/dav/",
  },
  { key: "webdav", kind: "webdav", labelKey: "preset.customWebdav", hintKey: "preset.customWebdavHint" },
  { key: "selfHosted", kind: "http", labelKey: "app.more.preset.selfHosted", hintKey: "app.more.preset.selfHostedHint" },
  { key: "s3", kind: "s3", labelKey: "preset.s3", hintKey: "preset.s3Hint", showBucket: true, showRegion: true },
  { key: "folder", kind: "folder", labelKey: "preset.folder", hintKey: "preset.folderHint", desktopOnly: true },
];

const EMPTY_CONFIG: SyncConfig = {
  kind: "webdav",
  endpoint: "",
  username: "",
  password: "",
  enabled: false,
} as SyncConfig;

export default function SyncScreen() {
  const colors = useTheme();
  const t = useT();
  const kv = useAppStore((s) => s.kv);

  const [config, setConfig] = useState<SyncConfig>(EMPTY_CONFIG);
  const [selectedPreset, setSelectedPreset] = useState("nutstore");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [peers, setPeers] = useState<PeerDeviceInfo[]>([]);
  const [status, setStatus] = useState("");

  const loadConfig = useCallback(async () => {
    const saved = await resolveSyncConfig();
    if (saved !== null) {
      setConfig(saved);
      const matched = SYNC_PRESETS.find((preset) => preset.kind === saved.kind);
      if (matched !== undefined) setSelectedPreset(matched.key);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void listPeerDevices().then(setPeers).catch(() => setPeers([]));
  }, [loadConfig]);

  const lastSync = useMemo(() => {
    const raw = kv["sync.last"];
    return raw !== undefined ? new Date(Number(raw)).toLocaleString() : t("more.lastSyncNever");
  }, [kv, t]);

  const update = (patch: Partial<SyncConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const onSave = async () => {
    setBusy(true);
    try {
      await saveSyncConfig(config);
      showToast({ message: t("more.status.saved"), tone: "success" });
      setStatus(t("more.status.saved"));
    } catch (err) {
      const message = t("more.status.saveFailed") + (err instanceof Error ? err.message : String(err));
      showToast({ message, tone: "danger" });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const outcome = await testSyncConnection(config);
      showToast({ message: outcome.message, tone: outcome.ok ? "success" : "danger" });
      setStatus(outcome.message);
    } catch (err) {
      const message = t("sync.testFailed") + (err instanceof Error ? err.message : String(err));
      showToast({ message, tone: "danger" });
      setStatus(message);
    } finally {
      setTesting(false);
    }
  };

  const onSyncNow = async () => {
    setBusy(true);
    setStatus(t("more.status.syncing"));
    try {
      const outcome = await runManualSync((progress) => {
        setStatus(
          t("sync.progress", {
            phase: t(`sync.phase.${progress.phase}`),
            done: progress.done,
            total: progress.total,
          }),
        );
      });
      showToast({ message: outcome.message, tone: outcome.ok ? "success" : "warning" });
      setStatus(outcome.message);
      void listPeerDevices().then(setPeers).catch(() => undefined);
    } catch (err) {
      const message = t("more.status.syncFailed") + (err instanceof Error ? err.message : String(err));
      showToast({ message, tone: "danger" });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const onPickFolder = async () => {
    const dir = await pickSyncFolder();
    if (dir !== null) update({ endpoint: dir });
  };

  const preset = SYNC_PRESETS.find((item) => item.key === selectedPreset);

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.canvas }}>
      <View style={styles.column}>
        <Card padding="normal" style={styles.introCard}>
          <AppText variant="body" tone="secondary" lines={4}>
            {t("sync.pageIntro")}
          </AppText>
        </Card>

        {/* ① 选择同步方式 */}
        <SectionHeader title={t("sync.step1")} />
        <View style={styles.pillRow}>
          {SYNC_PRESETS.map((item) => {
            const disabled = item.desktopOnly === true && !isDesktop();
            const selected = selectedPreset === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  setSelectedPreset(item.key);
                  update({
                    kind: item.kind,
                    ...(item.endpointTemplate !== undefined ? { endpoint: item.endpointTemplate } : {}),
                  });
                }}
                style={({ pressed }) => [
                  styles.pill,
                  {
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                    opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <AppText variant="caption" color={selected ? colors.onPrimary : colors.text} lines={1}>
                  {t(item.labelKey)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" tone="tertiary" lines={3} style={styles.hint}>
          {t(preset?.hintKey ?? "preset.nutstoreHint")}
        </AppText>
        {selectedPreset === "nutstore" ? (
          <AppText variant="caption" color={colors.warning} lines={4} style={styles.hint}>
            {t("sync.appPasswordHint")}
          </AppText>
        ) : null}

        {/* ② 填写账号 */}
        <SectionHeader title={t("sync.step2")} />
        {selectedPreset === "folder" ? (
          <Button
            label={t("more.pickFolder")}
            icon="folder-open-outline"
            disabled={busy || !isDesktop()}
            block
            onPress={() => void onPickFolder()}
          />
        ) : (
          <Card padding="normal" style={styles.formCard}>
            <Field
              label={t("more.server")}
              value={config.endpoint}
              onChangeText={(text) => update({ endpoint: text })}
              placeholder={
                selectedPreset === "s3" ? "https://oss-cn-hangzhou.aliyuncs.com" : "https://dav.example.com/gtd/"
              }
            />
            {preset?.showBucket === true ? (
              <Field label={t("sync.bucket")} value={config.bucket ?? ""} onChangeText={(text) => update({ bucket: text })} />
            ) : null}
            {preset?.showRegion === true ? (
              <Field label={t("sync.region")} value={config.region ?? ""} onChangeText={(text) => update({ region: text })} />
            ) : null}
            {config.kind === "s3" ? (
              <>
                <Field
                  label={t("sync.accessKeyId")}
                  value={config.accessKeyId ?? ""}
                  onChangeText={(text) => update({ accessKeyId: text })}
                />
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
          </Card>
        )}

        {config.endpoint.startsWith("http://") ? (
          <AppText variant="caption" color={colors.warning} lines={3} style={styles.hint}>
            {t("sync.cleartextWarn")}
          </AppText>
        ) : null}

        {/* ③ 启用并保存 */}
        <SectionHeader title={t("sync.step3")} />
        <Card padding="normal" style={styles.formCard}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: config.enabled }}
            onPress={() => update({ enabled: !config.enabled })}
            style={({ pressed }) => [styles.switchRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.switchTrack, { backgroundColor: config.enabled ? colors.primary : colors.surfaceMuted }]}>
              <View
                style={[
                  styles.switchThumb,
                  {
                    backgroundColor: colors.surface,
                    transform: [{ translateX: config.enabled ? 18 : 0 }],
                  },
                ]}
              />
            </View>
            <View style={styles.switchText}>
              <AppText variant="bodyStrong" lines={1}>
                {config.enabled ? t("sync.enableSwitchOn") : t("sync.enableSwitchOff")}
              </AppText>
              <AppText variant="caption" tone="tertiary" lines={2}>
                {t("sync.autoLabel")}
              </AppText>
            </View>
            <Ionicons name={config.enabled ? "checkmark-circle" : "ellipse-outline"} size={22} color={config.enabled ? colors.success : colors.textTertiary} />
          </Pressable>

          <Divider />

          <View style={styles.buttonRow}>
            <Button label={t("more.saveConfig")} block disabled={busy} onPress={() => void onSave()} />
          </View>
          <View style={styles.buttonRow}>
            <Button
              label={testing ? t("sync.testing") : t("sync.testConnection")}
              icon="wifi-outline"
              variant="secondary"
              block
              disabled={busy || testing}
              onPress={() => void onTest()}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              label={t("more.syncNow")}
              icon="sync-outline"
              variant="primary"
              block
              disabled={busy}
              onPress={() => void onSyncNow()}
            />
          </View>
        </Card>

        {status.length > 0 ? (
          <AppText variant="caption" tone="secondary" lines={4} style={styles.hint}>
            {status}
          </AppText>
        ) : null}

        <SectionHeader title={t("sync.peersTitle")} trailing={<AppText variant="caption" tone="tertiary">{lastSync}</AppText>} />
        <Card padding="normal" style={styles.formCard}>
          {peers.length === 0 ? (
            <AppText variant="caption" tone="tertiary" lines={2}>
              {t("sync.peersEmpty")}
            </AppText>
          ) : (
            peers.map((peer) => (
              <View key={peer.id} style={styles.peerRow}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.textSecondary} />
                <AppText variant="label" lines={1}>
                  {t("sync.deviceLabel", { id: peer.shortId })}
                </AppText>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {peer.lastActivityAt !== null ? new Date(peer.lastActivityAt).toLocaleString() : t("sync.peerNever")}
                </AppText>
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
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
    <View style={styles.fieldRow}>
      <AppText variant="caption" tone="tertiary" lines={1}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry === true}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  column: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: space.sm,
  },
  introCard: {
    backgroundColor: "transparent",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    justifyContent: "center",
  },
  hint: {
    paddingHorizontal: space.xs,
  },
  formCard: {
    gap: space.sm,
  },
  fieldRow: {
    gap: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
    minHeight: 44,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 48,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  switchText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  buttonRow: {
    paddingTop: 2,
  },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 4,
  },
});

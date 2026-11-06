import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  SectionHeader,
  showToast,
  useAppStore,
  useTheme,
  useT,
  hit,
  radius,
  space,
  type,
} from "@gtd/ui";
import {
  getSyncConfig,
  getSqliteExecutor,
  getWaitingTasks,
  getSomedayTasks,
  runCommand,
} from "@gtd/core";
import type { PeerDeviceInfo, SyncConfig } from "@gtd/core";
import {
  decryptSecret,
  listPeerDevices,
  resolveSyncConfig,
  pickSyncFolder,
  runManualSync,
  saveSyncConfig,
  testSyncConnection,
} from "@/platform/desktop-actions";
import { isDesktop } from "@/platform/env";

/** 同步预设：坚果云/WebDAV/自托管 HTTP/S3/本地文件夹 */
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
  { key: "selfHosted", kind: "http", labelKey: "app.more.preset.selfHosted", hintKey: "app.more.preset.selfHostedHint" },
  { key: "s3", kind: "s3", labelKey: "preset.s3", hintKey: "preset.s3Hint", showBucket: true, showRegion: true },
  { key: "folder", kind: "folder", labelKey: "preset.folder", hintKey: "preset.folderHint", desktopOnly: true },
];

/**
 * 更多：只放「低频总入口」，不再是设置大杂烩。
 *
 * 1 今日回顾 / 2 任务状态（既有预览，保留） / 3 洞察 / 4 清理 / 5 同步（折叠）
 * / 6 数据 →「数据与记录」页 / 7 设置 →「设置」页。
 *
 * 拆分原则：本页每个分组最多一行入口（EntryRow），高频项（同步配置）保留为折叠块；
 * 导出/导入/备份搬去 `/data`，主题/字体/语言/关于搬去 `/settings`。
 */
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
  const [selectedPreset, setSelectedPreset] = useState("nutstore");
  const [testing, setTesting] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [peers, setPeers] = useState<PeerDeviceInfo[] | null>(null);

  const syncLog = useMemo(() => {
    const raw = kv["sync.log"];
    if (raw === undefined) return null;
    try {
      const parsed = JSON.parse(raw) as {
        applied?: number;
        localWins?: number;
        remoteWins?: number;
        durationMs?: number;
        at?: number;
        mergedFields?: string[];
        conflictFields?: string[];
        conflicts?: { label: string }[];
      };
      return {
        applied: parsed.applied ?? 0,
        localWins: parsed.localWins ?? 0,
        remoteWins: parsed.remoteWins ?? 0,
        durationMs: parsed.durationMs ?? null,
        mergedFields: parsed.mergedFields ?? [],
        conflictFields: parsed.conflictFields ?? [],
        conflicts: parsed.conflicts ?? [],
      };
    } catch {
      return null;
    }
  }, [kv]);

  useEffect(() => {
    if (!syncOpen) return;
    let cancelled = false;
    void listPeerDevices()
      .then((list) => {
        if (!cancelled) setPeers(list);
      })
      .catch(() => {
        if (!cancelled) setPeers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [syncOpen]);

  useEffect(() => {
    void (async () => {
      // 敏感字段已经由 resolveSyncConfig 还原成明文（桌面 safeStorage / 移动 Keychain）
      const saved = await resolveSyncConfig();
      if (saved !== null) setConfig(saved);
    })();
  }, []);

  if (!loaded) return null;

  const lastSync =
    kv["sync.last"] !== undefined
      ? new Date(Number(kv["sync.last"])).toLocaleString()
      : t("more.lastSyncNever");
  const lastReviewAt = kv["review.lastAt"] !== undefined ? Number(kv["review.lastAt"]) : null;
  const lastReview =
    lastReviewAt !== null ? new Date(lastReviewAt).toLocaleDateString() : t("more.reviewNever");
  // 距上次回顾 ≥7 天（或从未回顾）时提示；红点只在 More 页出现
  const reviewDue = lastReviewAt === null || Date.now() - lastReviewAt >= 7 * 86_400_000;
  const reviewDistance =
    lastReviewAt === null
      ? t("app.more.reviewNever")
      : t("app.more.reviewDistance", {
          days: Math.max(0, Math.floor((Date.now() - lastReviewAt) / 86_400_000)),
        });
  const syncStatus = config.enabled ? t("app.more.syncStatusOn") : t("app.more.syncStatusOff");

  const update = (patch: Partial<SyncConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const flash = (message: string, tone: "success" | "danger" | "info" | "warning") => {
    setStatus(message);
    showToast({ message, tone });
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
      setStatus(outcome.message);
      showToast({ message: outcome.message, tone: outcome.ok ? "success" : "warning" });
      if (outcome.ok) {
        void listPeerDevices()
          .then(setPeers)
          .catch(() => undefined);
      }
    } catch (err) {
      const message = t("more.status.syncFailed") + (err instanceof Error ? err.message : String(err));
      flash(message, "danger");
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
      showToast({ message: t("more.status.saved"), tone: "success" });
    } catch (err) {
      const message = t("more.status.saveFailed") + (err instanceof Error ? err.message : String(err));
      flash(message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const onTestConnection = async () => {
    setTesting(true);
    try {
      const outcome = await testSyncConnection(config);
      setStatus(outcome.message);
      showToast({ message: outcome.message, tone: "info" });
    } catch (err) {
      const message = t("sync.testFailed") + (err instanceof Error ? err.message : String(err));
      flash(message, "danger");
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.canvas }}>
      <View style={styles.column}>
        {/* 0 同步：独立页面入口，放在最顶部——它原先在第 5 组折叠块里，
            手机上要滚过四组才看得到，会被误认为「只有电脑端有」。 */}
        <SectionHeader
          title={t("app.more.group.sync")}
          trailing={
            <AppText variant="caption" tone="tertiary" lines={1}>
              {syncStatus}
            </AppText>
          }
        />
        <Card variant="outline" padding="normal" style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("sync.pageTitle")}
            onPress={() => router.push("/sync")}
            style={({ pressed }) => [styles.syncHeader, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="cloud-outline" size={18} color={colors.primary} />
            <View style={styles.syncHeaderText}>
              <AppText variant="bodyStrong" lines={1}>
                {t("sync.pageTitle")}
              </AppText>
              <AppText variant="caption" tone="tertiary" lines={1}>
                {t("app.more.syncSummary", { time: lastSync, status: syncStatus })}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        </Card>

        {/* 1 今日回顾 */}
        <SectionHeader
          title={t("app.more.group.review")}
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
        />
        <Card variant="outline" padding="normal" style={styles.card}>
          <View style={styles.reviewRow}>
            <View style={styles.reviewText}>
              <AppText variant="bodyStrong" lines={1}>
                {reviewDistance}
              </AppText>
              {lastReviewAt !== null ? (
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {lastReview}
                </AppText>
              ) : null}
            </View>
            <Button
              label={t("more.reviewStart")}
              icon="refresh-circle-outline"
              variant="primary"
              onPress={() => router.push("/review")}
            />
          </View>
        </Card>

        {/* 2 任务状态（保留 v1 预览能力） */}
        <SectionHeader title={t("more.group.status")} />
        <Card variant="outline" padding="normal" style={styles.card}>
          <View style={styles.subHeaderRow}>
            <AppText variant="caption" tone="secondary" lines={1}>
              {t("more.waiting")}
            </AppText>
            <Badge label={String(waiting.length)} />
          </View>
          {waiting.length === 0 ? (
            <AppText variant="label" tone="tertiary" lines={1}>
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
            <Badge label={String(someday.length)} />
          </View>
          {someday.length === 0 ? (
            <AppText variant="label" tone="tertiary" lines={1}>
              {t("more.somedayEmpty")}
            </AppText>
          ) : (
            someday.slice(0, 3).map((task) => (
              <PreviewRow key={task.id} title={task.title} onPress={() => router.push(`/task/${task.id}`)} />
            ))
          )}
        </Card>

        {/* 3 洞察 */}
        <SectionHeader title={t("app.more.group.insights")} />
        <Card variant="outline" padding="none" style={styles.card}>
          <EntryRow
            icon="stats-chart-outline"
            label={t("app.more.stats")}
            hint={t("app.more.statsHint")}
            onPress={() => router.push("/insights")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="grid-outline"
            label={t("app.more.matrix")}
            hint={t("app.more.matrixHint")}
            onPress={() => router.push("/matrix")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="search-outline"
            label={t("app.more.search")}
            hint={t("app.more.searchHint")}
            onPress={() => router.push("/search")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="albums-outline"
            label={t("app.more.templates")}
            hint={t("app.more.templatesHint")}
            onPress={() => router.push("/templates")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="library-outline"
            label={t("materials.title")}
            hint={t("materials.subtitle")}
            onPress={() => router.push("/materials")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="stats-chart-outline"
            label={t("writing.title")}
            hint={t("writing.subtitle")}
            onPress={() => router.push("/writing")}
          />
        </Card>

        {/* 4 清理 */}
        <SectionHeader title={t("app.more.group.cleanup")} />
        <Card variant="outline" padding="none" style={styles.card}>
          <EntryRow
            icon="checkmark-done-outline"
            label={t("more.completedEntry")}
            onPress={() => router.push("/completed")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="trash-outline"
            label={t("more.trashEntry")}
            onPress={() => router.push("/trash")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="time-outline"
            label={t("app.more.recent")}
            hint={t("app.more.recentHint")}
            onPress={() => router.push("/recent")}
          />
        </Card>

        {/* 5 同步（默认收起） */}
        <SectionHeader
          title={t("app.more.group.sync")}
          trailing={
            <AppText variant="caption" tone="tertiary" lines={1}>
              {syncStatus}
            </AppText>
          }
        />
        <Card variant="outline" padding="normal" style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={syncOpen ? t("app.more.syncExpanded") : t("app.more.syncCollapsed")}
            accessibilityState={{ expanded: syncOpen }}
            onPress={() => setSyncOpen((value) => !value)}
            style={({ pressed }) => [styles.syncHeader, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="cloud-outline" size={18} color={colors.primary} />
            <View style={styles.syncHeaderText}>
              <AppText variant="bodyStrong" lines={1}>
                {t("app.more.syncSummary", { time: lastSync, status: syncStatus })}
              </AppText>
              <AppText variant="caption" tone="tertiary" lines={1}>
                {syncOpen ? t("app.more.syncExpanded") : t("app.more.syncCollapsed")}
              </AppText>
            </View>
            <Ionicons name={syncOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textTertiary} />
          </Pressable>

          {syncOpen ? (
            <View style={styles.syncBody}>
              <View style={styles.pillRow}>
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
              <AppText variant="caption" tone="tertiary" lines={3}>
                {t(SYNC_PRESETS.find((preset) => preset.key === selectedPreset)?.hintKey ?? "preset.nutstoreHint")}
              </AppText>

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
                    placeholder={
                      selectedPreset === "s3"
                        ? "https://oss-cn-hangzhou.aliyuncs.com"
                        : "https://dav.example.com/gtd/"
                    }
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

              <View style={styles.inlineRow}>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {t("sync.autoLabel")}
                </AppText>
                <SegPill
                  label={t("sync.autoOn")}
                  selected={kv["sync.auto"] !== "0"}
                  onPress={() => void runCommand("settings.set", { key: "sync.auto", value: "1" }).catch(() => undefined)}
                />
                <SegPill
                  label={t("sync.autoOff")}
                  selected={kv["sync.auto"] === "0"}
                  onPress={() => void runCommand("settings.set", { key: "sync.auto", value: "0" }).catch(() => undefined)}
                />
              </View>

              <AppText variant="caption" tone="tertiary" lines={1}>
                {t("sync.peersTitle")}
              </AppText>
              {peers === null ? null : peers.length === 0 ? (
                <AppText variant="caption" tone="tertiary" lines={2}>
                  {t("sync.peersEmpty")}
                </AppText>
              ) : (
                peers.map((peer) => (
                  <AppText key={peer.id} variant="caption" tone="secondary" lines={1}>
                    {t("sync.peerLine", {
                      device: t("sync.deviceLabel", { id: peer.shortId }),
                      n: peer.recordCount,
                      time:
                        peer.lastActivityAt === null
                          ? t("sync.peerNever")
                          : new Date(peer.lastActivityAt).toLocaleString(),
                    })}
                  </AppText>
                ))
              )}

              <Divider style={styles.groupDivider} />
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
                  {syncLog.durationMs !== null ? (
                    <AppText variant="caption" tone="tertiary" lines={1}>
                      {t("sync.duration", { sec: Math.max(1, Math.round(syncLog.durationMs / 1000)) })}
                    </AppText>
                  ) : null}
                  {syncLog.mergedFields.length > 0 ? (
                    <AppText variant="caption" tone="tertiary" lines={2}>
                      {t("sync.mergedFieldLine", { fields: syncLog.mergedFields.join(", ") })}
                    </AppText>
                  ) : null}
                  {syncLog.conflictFields.length > 0 ? (
                    <AppText variant="caption" tone="warning" lines={2}>
                      {t("sync.conflictFieldLine", { fields: syncLog.conflictFields.join(", ") })}
                    </AppText>
                  ) : null}
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
            </View>
          ) : null}
        </Card>

        {/* 6 数据 / 7 设置：一行跳转到独立页面 */}
        <Card variant="outline" padding="none" style={styles.tailCard}>
          <EntryRow
            icon="server-outline"
            label={t("more.group.data")}
            onPress={() => router.push("/data")}
          />
          <Divider inset={space.lg} />
          <EntryRow
            icon="options-outline"
            label={t("app.more.settings")}
            onPress={() => router.push("/settings")}
          />
        </Card>

        {status.length > 0 ? (
          <AppText variant="label" tone="secondary" lines={3} style={styles.status}>
            {status}
          </AppText>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** 入口行：图标 + 主文案 + 说明 + chevron（本页 / 数据页 / 设置页各自持有一份，不跨路由共享） */
function EntryRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint === undefined ? label : `${label}，${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.entryRow, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View style={styles.entryText}>
        <AppText variant="body" lines={1}>
          {label}
        </AppText>
        {hint !== undefined ? (
          <AppText variant="caption" tone="tertiary" lines={1}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
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
    paddingBottom: space.huge,
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
  tailCard: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  reviewText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  subHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  groupDivider: {
    marginVertical: space.xs,
  },
  entryRow: {
    minHeight: hit.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  entryText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  previewRow: {
    minHeight: hit.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  previewTitle: {
    flex: 1,
    minWidth: 0,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
  },
  pill: {
    minHeight: hit.min,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    justifyContent: "center",
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
  },
  syncHeader: {
    minHeight: hit.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  syncHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  syncBody: {
    gap: space.sm,
    paddingTop: space.xs,
  },
  field: {
    gap: space.xxs,
  },
  input: {
    height: hit.min,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: type.body.fontSize,
  },
  status: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
});

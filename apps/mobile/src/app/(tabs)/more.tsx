import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  AppText,
  Button,
  Card,
  SectionHeader,
  useAppStore,
  useTheme,
  useT,
  setLang,
  getLang,
} from "@gtd/ui";
import { getSyncConfig, getSqliteExecutor, getWaitingTasks, getSomedayTasks, runCommand } from "@gtd/core";
import type { SyncConfig } from "@gtd/core";
import {
  exportAllToFile,
  importFromFile,
  pickSyncFolder,
  runManualSync,
  saveSyncConfig,
} from "@/platform/desktop-actions";
import { isDesktop } from "@/platform/env";

const KIND_KEYS: { kind: SyncConfig["kind"]; labelKey: string }[] = [
  { kind: "webdav", labelKey: "more.kind.webdav" },
  { kind: "http", labelKey: "more.kind.http" },
  { kind: "folder", labelKey: "more.kind.folder" },
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
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [lang, setLangUi] = useState(getLang());

  useEffect(() => {
    void (async () => {
      const saved = await getSyncConfig(getSqliteExecutor());
      if (saved !== null) setConfig(saved);
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

  const onExport = async () => {
    setBusy(true);
    try {
      const target = await exportAllToFile();
      setStatus(target === null ? t("more.status.canceled") : t("more.status.exported") + target);
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
        {/* 等待中 / 将来也许 预览 */}
        <SectionHeader
          title={t("more.waiting")}
          trailing={
            <AppText variant="caption" tone="tertiary" lines={1}>
              {String(waiting.length)}
            </AppText>
          }
        />
        <Card compact style={styles.block}>
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
        </Card>

        <SectionHeader
          title={t("more.someday")}
          trailing={
            <AppText variant="caption" tone="tertiary" lines={1}>
              {String(someday.length)}
            </AppText>
          }
        />
        <Card compact style={styles.block}>
          {someday.length === 0 ? (
            <AppText variant="label" tone="tertiary" lines={1}>
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
        </Card>

        {/* 语言 */}
        <SectionHeader title={t("more.language")} />
        <View style={styles.inlineRow}>
          <SegPill label={t("more.lang.zh")} selected={lang === "zh"} onPress={() => onSwitchLang("zh")} />
          <SegPill label={t("more.lang.en")} selected={lang === "en"} onPress={() => onSwitchLang("en")} />
        </View>

        {/* 每周回顾 */}
        <SectionHeader
          title={t("more.reviewSection")}
          trailing={
            <AppText variant="caption" tone="tertiary" lines={1}>
              {lastReview}
            </AppText>
          }
        />
        <View style={styles.block}>
          <Button
            label={t("more.reviewStart")}
            icon="refresh-circle-outline"
            variant="primary"
            block
            onPress={() => router.push("/review")}
          />
        </View>

        {/* 同步 */}
        <SectionHeader title={t("more.syncSection")} />
        <Card style={styles.block}>
          <View style={styles.inlineRow}>
            {KIND_KEYS.map(({ kind, labelKey }) => (
              <SegPill
                key={kind}
                label={t(labelKey)}
                selected={config.kind === kind}
                disabled={kind === "folder" && !isDesktop()}
                onPress={() => update({ kind })}
              />
            ))}
          </View>

          {config.kind === "folder" ? (
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
                placeholder="https://dav.example.com/gtd/"
              />
              <Field
                label={t("more.username")}
                value={config.username ?? ""}
                onChangeText={(text) => update({ username: text })}
              />
              <Field
                label={t("more.password")}
                value={config.password ?? ""}
                onChangeText={(text) => update({ password: text })}
                secureTextEntry
              />
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
          </View>

          <AppText variant="caption" tone="tertiary" lines={1}>
            {t("more.lastSync")}
            {lastSync}
          </AppText>
        </Card>

        {/* 数据 */}
        <SectionHeader title={t("more.dataSection")} />
        <View style={styles.block}>
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
        </View>

        {/* 关于 */}
        <SectionHeader title={t("more.about")} />
        <View style={styles.block}>
          <Button label={t("more.about")} icon="information-circle-outline" block onPress={() => router.push("/about")} />
        </View>

        {status.length > 0 ? (
          <AppText variant="label" tone="secondary" lines={3} style={styles.status}>
            {status}
          </AppText>
        ) : null}
      </View>
    </ScrollView>
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
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
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
  status: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

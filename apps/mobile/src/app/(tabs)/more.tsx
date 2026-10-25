import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import {
  Screen,
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

/** 更多：等待中 / 将来也许 / 语言 / 同步设置 / 数据导入导出 / 回顾与关于 */
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
    kv["sync.last"] !== undefined ? new Date(Number(kv["sync.last"])).toLocaleString() : t("more.lastSyncNever");
  const lastReview =
    kv["review.lastAt"] !== undefined
      ? new Date(Number(kv["review.lastAt"])).toLocaleDateString()
      : t("more.reviewNever");

  const update = (patch: Partial<SyncConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const onSwitchLang = (next: "zh" | "en") => {
    setLang(next);
    setLangUi(next);
    // 持久化到 kv；桌面主进程监听该命令重建菜单/托盘
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
    <Screen>
      <SectionHeader
        title={t("more.waiting")}
        trailing={<Text maxFontSizeMultiplier={1.2} style={{ color: colors.textSecondary }}>{waiting.length}</Text>}
      />
      <View style={styles.list}>
        {waiting.slice(0, 3).map((task) => (
          <TaskLink key={task.id} id={task.id} title={task.title} waitingFor={task.waitingFor} />
        ))}
        {waiting.length === 0 ? (
          <Text maxFontSizeMultiplier={1.2} style={[styles.empty, { color: colors.textSecondary }]}>{t("more.waitingEmpty")}</Text>
        ) : null}
      </View>

      <SectionHeader
        title={t("more.someday")}
        trailing={<Text maxFontSizeMultiplier={1.2} style={{ color: colors.textSecondary }}>{someday.length}</Text>}
      />
      <View style={styles.list}>
        {someday.slice(0, 3).map((task) => (
          <TaskLink key={task.id} id={task.id} title={task.title} waitingFor={null} />
        ))}
        {someday.length === 0 ? (
          <Text maxFontSizeMultiplier={1.2} style={[styles.empty, { color: colors.textSecondary }]}>{t("more.somedayEmpty")}</Text>
        ) : null}
      </View>

      <SectionHeader title={t("more.language")} />
      <View style={styles.list}>
        <View style={styles.rowWrap}>
          <ChipButton
            label={t("more.lang.zh")}
            selected={lang === "zh"}
            onPress={() => onSwitchLang("zh")}
          />
          <ChipButton
            label={t("more.lang.en")}
            selected={lang === "en"}
            onPress={() => onSwitchLang("en")}
          />
        </View>
      </View>

      <SectionHeader
        title={t("more.reviewSection")}
        trailing={<Text maxFontSizeMultiplier={1.2} style={{ color: colors.textSecondary }}>{lastReview}</Text>}
      />
      <View style={styles.list}>
        <ActionButton label={t("more.reviewStart")} onPress={() => router.push("/review")} primary />
      </View>

      <SectionHeader title={t("more.syncSection")} />
      <View style={styles.list}>
        <View style={styles.rowWrap}>
          {KIND_KEYS.map(({ kind, labelKey }) => (
            <ChipButton
              key={kind}
              label={t(labelKey)}
              selected={config.kind === kind}
              disabled={kind === "folder" && !isDesktop()}
              onPress={() => update({ kind })}
            />
          ))}
        </View>
        {config.kind === "folder" ? (
          <ActionButton
            label={t("more.pickFolder")}
            disabled={busy || !isDesktop()}
            onPress={() => void onPickFolder()}
          />
        ) : (
          <>
            <Field
              label={t("more.server")}
              value={config.endpoint}
              onChangeText={(text) => update({ endpoint: text })}
            />
            <Field label={t("more.username")} value={config.username ?? ""} onChangeText={(text) => update({ username: text })} />
            <Field
              label={t("more.password")}
              value={config.password ?? ""}
              onChangeText={(text) => update({ password: text })}
              secureTextEntry
            />
          </>
        )}
        <View style={styles.rowWrap}>
          <ChipButton
            label={config.enabled ? t("more.enabled") : t("more.disabled")}
            selected={config.enabled}
            onPress={() => update({ enabled: !config.enabled })}
          />
          <ActionButton label={t("more.saveConfig")} disabled={busy} onPress={() => void onSave()} />
          <ActionButton label={t("more.syncNow")} disabled={busy} onPress={() => void onSyncNow()} primary />
        </View>
        <Text maxFontSizeMultiplier={1.2} style={[styles.empty, { color: colors.textSecondary }]}>
          {t("more.lastSync")}
          {lastSync}
        </Text>
      </View>

      <SectionHeader title={t("more.dataSection")} />
      <View style={styles.list}>
        <ActionButton label={t("more.export")} disabled={busy} onPress={() => void onExport()} />
        <ActionButton label={t("more.import")} disabled={busy} onPress={() => void onImport()} />
      </View>

      <SectionHeader title={t("more.about")} />
      <View style={styles.list}>
        <ActionButton label={t("more.about")} onPress={() => router.push("/about")} />
      </View>

      {status.length > 0 ? (
        <Text maxFontSizeMultiplier={1.2} style={[styles.status, { color: colors.textSecondary }]}>{status}</Text>
      ) : null}
    </Screen>
  );
}

function TaskLink({ id, title, waitingFor }: { id: string; title: string; waitingFor: string | null }) {
  const colors = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("task.a11yOpen", { title })}
      onPress={() => router.push(`/task/${id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text maxFontSizeMultiplier={1.2} style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {waitingFor !== null ? (
        <Text maxFontSizeMultiplier={1.2} style={[styles.sub, { color: colors.textSecondary }]}>
          {t("more.waitingFor", { who: waitingFor })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ChipButton({
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
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled === true ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text maxFontSizeMultiplier={1.2} style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
  primary,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  primary?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary === true ? colors.primary : colors.surface,
          opacity: disabled === true ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text maxFontSizeMultiplier={1.2} style={{ color: primary === true ? colors.onPrimary : colors.text, fontSize: 15, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.field}>
      <Text maxFontSizeMultiplier={1.2} style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput maxFontSizeMultiplier={1.2}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    gap: 8,
  },
  row: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 2,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  rowText: {
    fontSize: 16,
    lineHeight: 24,
  },
  sub: {
    fontSize: 13,
  },
  empty: {
    fontSize: 15,
    paddingVertical: 4,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  status: {
    fontSize: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
});

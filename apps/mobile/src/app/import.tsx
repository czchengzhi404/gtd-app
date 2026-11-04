import { useMemo, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedControl,
  showToast,
  radius,
  space,
  useTheme,
  useT,
} from "@gtd/ui";
import {
  parseImportText,
  parseMarkdownTasks,
  parseTickTickCSV,
  parseTodoistCSV,
  runCommand,
  type ImportPlan,
  type ImportTaskDraft,
} from "@gtd/core";

/**
 * 导入页（Markdown 复选框清单 / Todoist CSV）。
 *
 * 为什么做"粘贴"而不是只做"选文件"：移动端读任意目录文件需要额外权限与
 * DocumentPicker 授权链，而剪贴板粘贴在两个平台上都零权限、可预览、可取消。
 * 文件入口保留在桌面（更多 → 导入 JSON）；文本导入是它的补充，不是替代。
 *
 * 导入策略：项目 find-or-create → 逐条 task.create（每条一个 immediate 事务）→
 * 已完成条目补 task.complete。任一失败即停止并报告已完成数量，不静默吞错。
 */

type Format = "auto" | "markdown" | "todoist" | "ticktick";

const PREVIEW_LIMIT = 5;

export default function ImportScreen() {
  const colors = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const plan: ImportPlan | null = useMemo(() => {
    if (text.trim().length === 0) return null;
    const now = Date.now();
    if (format === "markdown") return parseMarkdownTasks(text, now);
    if (format === "todoist") return parseTodoistCSV(text, now);
    if (format === "ticktick") return parseTickTickCSV(text, now);
    return parseImportText(text, now);
  }, [text, format]);

  const importable = plan !== null && plan.tasks.length > 0 && !busy;

  const runImport = async () => {
    if (plan === null || plan.tasks.length === 0) return;
    setBusy(true);
    let done = 0;
    const total = plan.tasks.length;
    setProgress({ done, total });
    try {
      const projectIdByName = new Map<string, string>();
      for (const name of plan.projects) {
        const result = await runCommand("project.upsert", { name, kind: "parallel" });
        const record = result.records[0]?.record;
        if (record !== undefined && "name" in record) projectIdByName.set(name, record.id);
      }
      for (const draft of plan.tasks) {
        await createDraft(draft, projectIdByName);
        done += 1;
        setProgress({ done, total });
      }
      showToast({ message: t("app.importPage.done", { n: total }), tone: "success" });
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ message: t("app.importPage.failed", { n: done, message }), tone: "danger" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Screen>
      <PageHeader title={t("app.importPage.title")} subtitle={t("app.importPage.subtitle")} onBack={() => router.back()} backLabel={t("app.route.importPage")} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="outline" padding="normal">
          <AppText variant="label" tone="secondary" lines={2}>
            {t("app.importPage.hint")}
          </AppText>
          <View style={styles.gap} />
          <SegmentedControl
            items={[
              { key: "auto", label: t("app.importPage.formatAuto") },
              { key: "markdown", label: "Markdown" },
              { key: "todoist", label: "Todoist" },
              { key: "ticktick", label: "TickTick" },
            ]}
            value={format}
            onChange={(value) => setFormat(value as Format)}
            accessibilityLabel={t("app.importPage.formatLabel")}
          />
          <View style={styles.gap} />
          <TextInput
            multiline
            value={text}
            onChangeText={setText}
            placeholder={t("app.importPage.placeholder")}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel={t("app.importPage.a11yInput")}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          />
          <AppText variant="caption" tone="tertiary" lines={3} style={styles.example}>
            {t("app.importPage.example")}
          </AppText>
        </Card>

        {plan !== null ? (
          <>
            <SectionHeader title={t("app.importPage.preview")} />
            <Card variant="outline" padding="normal">
              <View style={styles.row}>
                <Badge
                  label={plan.format === "todoist" ? "Todoist CSV" : "Markdown"}
                  tone="accent"
                />
                <View style={styles.stats}>
                  <AppText variant="label" tone="secondary" lines={1}>
                    {t("app.importPage.stats", {
                      tasks: plan.tasks.length,
                      projects: plan.projects.length,
                      skipped: plan.skipped,
                    })}
                  </AppText>
                </View>
              </View>
              {plan.warnings.length > 0 ? (
                <AppText variant="caption" tone="warning" lines={2} style={styles.warning}>
                  {plan.warnings.join(" / ")}
                </AppText>
              ) : null}
              <View style={styles.gap} />
              {plan.tasks.slice(0, PREVIEW_LIMIT).map((task, index) => (
                <View key={`${task.title}-${String(index)}`}>
                  {index > 0 ? <Divider inset={0} style={styles.divider} /> : null}
                  <View style={styles.taskRow}>
                    <AppText variant="body" lines={1} style={styles.taskTitle}>
                      {task.title}
                    </AppText>
                    {task.projectName !== null ? (
                      <Badge label={`#${task.projectName}`} size="sm" />
                    ) : null}
                    {task.priority > 0 ? (
                      <Badge label={`P${task.priority}`} size="sm" tone="warning" />
                    ) : null}
                    {task.completed ? (
                      <Badge label={t("app.importPage.completed")} size="sm" tone="success" />
                    ) : null}
                  </View>
                </View>
              ))}
              {plan.tasks.length > PREVIEW_LIMIT ? (
                <AppText variant="caption" tone="tertiary" lines={1} style={styles.more}>
                  {t("app.importPage.more", { n: plan.tasks.length - PREVIEW_LIMIT })}
                </AppText>
              ) : null}
            </Card>
          </>
        ) : null}

        {progress !== null ? (
          <View style={styles.progress}>
            <ProgressBar
              value={progress.total === 0 ? 0 : progress.done / progress.total}
              label={t("app.importPage.progress", { done: progress.done, total: progress.total })}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={busy ? t("app.importPage.importing") : t("app.importPage.action")}
            icon="cloud-upload-outline"
            variant="primary"
            block
            loading={busy}
            disabled={!importable}
            onPress={() => void runImport()}
          />
          <Button
            label={t("app.importPage.clear")}
            variant="ghost"
            block
            disabled={busy || text.length === 0}
            onPress={() => setText("")}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

async function createDraft(
  draft: ImportTaskDraft,
  projectIdByName: Map<string, string>,
): Promise<void> {
  const contextIds: string[] = [];
  for (const name of draft.contextNames) {
    const result = await runCommand("context.upsert", { name });
    const record = result.records[0]?.record;
    if (record !== undefined && "name" in record) contextIds.push(record.id);
  }
  const projectId =
    draft.projectName !== null ? (projectIdByName.get(draft.projectName) ?? null) : null;
  const created = await runCommand("task.create", {
    title: draft.title,
    notes: draft.notes,
    status: draft.status,
    priority: draft.priority,
    dueAt: draft.dueAt,
    projectId,
    contextIds,
    tags: draft.tags,
  });
  const taskRecord = created.records[0]?.record;
  if (taskRecord === undefined) return;
  if (draft.completed) {
    await runCommand("task.complete", { id: taskRecord.id });
  }
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    gap: space.sm,
    maxWidth: 880,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    gap: space.sm,
  },
  input: {
    minHeight: 180,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    fontSize: 14,
    lineHeight: 21,
    textAlignVertical: "top",
  },
  example: {
    marginTop: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  stats: {
    flex: 1,
    alignItems: "flex-end",
  },
  warning: {
    marginTop: space.xs,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 40,
  },
  taskTitle: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    marginVertical: space.xs,
  },
  more: {
    marginTop: space.sm,
  },
  progress: {
    marginTop: space.sm,
  },
  actions: {
    marginTop: space.lg,
    gap: space.sm,
  },
  gap: {
    height: space.sm,
  },
});

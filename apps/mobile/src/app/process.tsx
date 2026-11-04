import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  MarkdownView,
  ProgressBar,
  Skeleton,
  showPrompt,
  showToast,
  hit,
  radius,
  space,
  type,
  useAppStore,
  useKeyboardShortcuts,
  useTheme,
  useT,
} from "@gtd/ui";
import {
  appStore,
  clarifyOptions,
  clarifyProgress,
  getInboxTasks,
  recommendedClarify,
  runCommand,
} from "@gtd/core";
import type { ClarifyAction, Task } from "@gtd/core";

import { completeTaskWithUndo, deleteTaskWithUndo } from "@/lib/task-ops";

/**
 * 理清向导（GTD 的 Process 步骤）。
 *
 * 队列是进入页面时的收集箱快照（按创建时间升序），处理完一条自动前进；
 * ← / → 可以在快照内回看/前进，1–9 直接触发对应动作（桌面键盘增强）。
 * 所有写操作都通过 core 命令，页面只负责顺序、反馈与撤销接线。
 */
export default function ProcessScreen() {
  const colors = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  const loaded = useAppStore((s) => s.loaded);
  const inbox = useAppStore(getInboxTasks);
  const taskById = useAppStore((s) => s.tasks);
  const projects = useAppStore((s) => s.projects);
  const contexts = useAppStore((s) => s.contexts);

  const [order, setOrder] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, Task>>({});
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // 首次进入：用当时收集箱生成处理顺序（快照保证处理完的任务还能按 ← 回看）
  useEffect(() => {
    if (!loaded || started) return;
    const sorted = [...inbox].sort((a, b) => a.createdAt - b.createdAt);
    setOrder(sorted.map((task) => task.id));
    setSnapshots(Object.fromEntries(sorted.map((task) => [task.id, task])));
    setStarted(true);
  }, [loaded, inbox, started]);

  // 会话期间新进收集箱的任务，追加到队尾（不在用户无感的情况下丢弃）
  useEffect(() => {
    if (!started) return;
    const known = new Set(order);
    const added = inbox.filter((task) => !known.has(task.id));
    if (added.length === 0) return;
    setOrder((previous) => [...previous, ...added.map((task) => task.id)]);
    setSnapshots((previous) => {
      const next = { ...previous };
      for (const task of added) next[task.id] = task;
      return next;
    });
  }, [inbox, order, started]);

  const inboxIds = useMemo(() => new Set(inbox.map((task) => task.id)), [inbox]);
  const total = order.length;
  const processedCount = useMemo(
    () => order.filter((id) => !inboxIds.has(id)).length,
    [order, inboxIds],
  );

  const stateSnapshot = useAppStore((s) => s);
  const progress = useMemo(() => clarifyProgress(stateSnapshot, Date.now()), [stateSnapshot]);

  const currentId = order[index];
  const current: Task | null =
    currentId === undefined ? null : (taskById[currentId] ?? snapshots[currentId] ?? null);
  const isProcessed = currentId !== undefined && !inboxIds.has(currentId);

  const recommendation = useMemo(
    () => (current === null ? null : recommendedClarify(current, Date.now())),
    [current],
  );
  const options = useMemo(
    () => (current === null ? [] : clarifyOptions(current, Date.now())),
    [current],
  );

  /** 处理完一条后：跳到下一条仍在收集箱的任务（先向后，再绕回前面被跳过的） */
  const advance = useCallback(
    (from: number) => {
      const ids = new Set(getInboxTasks(appStore.getState()).map((task) => task.id));
      for (let i = from; i < order.length; i += 1) {
        const id = order[i];
        if (id !== undefined && ids.has(id)) {
          setIndex(i);
          return;
        }
      }
      for (let i = 0; i < from; i += 1) {
        const id = order[i];
        if (id !== undefined && ids.has(id)) {
          setIndex(i);
          return;
        }
      }
      setIndex(order.length);
    },
    [order],
  );

  const runAction = useCallback(
    async (action: ClarifyAction) => {
      if (current === null || busy) return;

      const task = current;
      const goNext = () => {
        setEditing(false);
        advance(index + 1);
      };
      setBusy(true);
      try {
        switch (action) {
          case "next":
            await runCommand("task.moveStatus", { id: task.id, status: "next" });
            goNext();
            break;
          case "waiting":
            // moveStatus 不改 waitingFor：已有的等待对象自然保留
            await runCommand("task.moveStatus", { id: task.id, status: "waiting" });
            goNext();
            break;
          case "someday":
            await runCommand("task.moveStatus", { id: task.id, status: "someday" });
            goNext();
            break;
          case "done":
            await completeTaskWithUndo(task);
            goNext();
            break;
          case "trash":
            await deleteTaskWithUndo(task);
            goNext();
            break;
          case "twoMinute":
            // 保留下一步状态，把用户送到专注页立刻做
            showToast({ message: t("app.process.twoMinute"), tone: "info" });
            router.push("/(tabs)/focus");
            break;
          case "delegate": {
            const who = await showPrompt({
              title: t("app.process.waitingForTitle"),
              placeholder: t("app.process.waitingForPlaceholder"),
              validate: (value) =>
                value.trim().length === 0 ? t("app.process.required") : null,
            });
            if (who === null) break;
            await runCommand("task.update", { id: task.id, patch: { waitingFor: who } });
            await runCommand("task.moveStatus", { id: task.id, status: "waiting" });
            showToast({ message: t("app.process.delegated", { who }), tone: "success" });
            goNext();
            break;
          }
          case "project": {
            const name = await showPrompt({
              title: t("app.process.projectTitle"),
              placeholder: t("app.process.projectPlaceholder"),
              validate: (value) =>
                value.trim().length === 0 ? t("app.process.required") : null,
            });
            if (name === null) break;
            const result = await runCommand("project.upsert", { name, kind: "parallel" });
            const record = result.records[0]?.record;
            if (record === undefined || record === null || !("kind" in record)) break;
            await runCommand("task.update", { id: task.id, patch: { projectId: record.id } });
            await runCommand("task.moveStatus", { id: task.id, status: "next" });
            showToast({
              message: t("app.process.projectCreated", { name }),
              tone: "success",
            });
            goNext();
            break;
          }
          case "defer": {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            await runCommand("task.update", {
              id: task.id,
              patch: { deferUntil: tomorrow.getTime() },
            });
            await runCommand("task.moveStatus", { id: task.id, status: "next" });
            showToast({ message: t("app.process.deferred"), tone: "success" });
            goNext();
            break;
          }
          default:
            break;
        }
      } catch {
        /* runCommand 已把错误写进 store.lastError；页面保持当前项 */
      } finally {
        setBusy(false);
      }
    },
    [advance, busy, current, index, t],
  );

  const startEdit = () => {
    if (current === null) return;
    setDraft(current.title);
    setEditing(true);
  };

  const commitTitle = async () => {
    if (current === null) {
      setEditing(false);
      return;
    }
    const title = draft.trim();
    setEditing(false);
    if (title.length === 0 || title === current.title) return;
    await runCommand("task.update", { id: current.id, patch: { title } }).catch(() => undefined);
  };

  const goPrev = useCallback(() => {
    setEditing(false);
    setIndex((previous) => Math.max(0, previous - 1));
  }, []);

  const goNextManual = useCallback(() => {
    setEditing(false);
    setIndex((previous) => Math.min(Math.max(0, order.length - 1), previous + 1));
  }, [order.length]);

  // 键盘：1–9 触发动作，←/→ 上下一条，Esc 返回（编辑标题时整体禁用，避免吞掉输入）
  const shortcuts = useMemo(() => {
    if (editing || busy || current === null) return [];
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    return [...keys.map((key) => ({ key })), { key: "ArrowLeft" }, { key: "ArrowRight" }, { key: "Escape" }];
  }, [busy, editing, current]);

  const onKey = useCallback(
    (key: string) => {
      if (key === "Escape") {
        if (router.canGoBack()) router.back();
        else router.navigate("/");
        return;
      }
      if (key === "ArrowLeft") {
        goPrev();
        return;
      }
      if (key === "ArrowRight") {
        goNextManual();
        return;
      }
      const number = Number(key);
      if (Number.isInteger(number) && number >= 1 && number <= options.length) {
        const option = options[number - 1];
        if (option !== undefined) void runAction(option.key);
      }
    },
    [goNextManual, goPrev, options, runAction],
  );
  useKeyboardShortcuts(shortcuts, onKey);

  const projectId = current?.projectId ?? null;
  const projectName = projectId === null ? undefined : projects[projectId]?.name;
  const contextNames = (current?.contextIds ?? [])
    .map((id) => contexts[id]?.name)
    .filter((name): name is string => name !== undefined);

  if (!loaded || !started) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
        <View style={styles.column}>
          <View style={styles.loadingBlock}>
            <Skeleton height={8} radius={radius.xs} />
            <Skeleton height={180} radius={radius.lg} />
            <Skeleton height={120} radius={radius.md} />
            <Skeleton height={44} radius={radius.sm} width="70%" />
            <Skeleton height={44} radius={radius.sm} width="70%" />
          </View>
        </View>
      </View>
    );
  }

  if (inbox.length === 0 || index >= order.length) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
        <EmptyState
          illustration="inbox"
          title={t("app.process.emptyTitle")}
          hint={t("app.process.emptyHint")}
          action={{
            label: t("app.process.backToInbox"),
            icon: "file-tray-outline",
            onPress: () => router.navigate("/"),
          }}
        />
      </View>
    );
  }

  if (current === null) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
        <EmptyState
          illustration="inbox"
          title={t("app.process.emptyTitle")}
          hint={t("app.process.emptyHint")}
          action={{
            label: t("app.process.backToInbox"),
            icon: "file-tray-outline",
            onPress: () => router.navigate("/"),
          }}
        />
      </View>
    );
  }

  const recommendationLabel =
    recommendation === null
      ? ""
      : t("app.process.suggestion", {
          action: t(`app.clarify.action.${recommendation.action}.label`),
        });
  const reasonLabel =
    recommendation === null
      ? ""
      : t("app.process.reason", {
          reason: t(`app.${recommendation.reasonCode}`),
        });

  const summarySource = current.notes.split(/\r?\n/).slice(0, 3).join("\n").trim();

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.column, styles.scrollContent]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <AppText variant="label" weight="600" lines={1} style={styles.progressTitle}>
              {t("app.process.progress")}
            </AppText>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {t("app.process.oldest", { days: progress.oldestInboxAgeDays })}
            </AppText>
          </View>
          <ProgressBar
            value={total === 0 ? 0 : processedCount / total}
            label={t("app.process.remaining", {
              n: progress.inboxCount,
              m: progress.processedToday,
            })}
          />
        </View>

        <Card variant="outline" padding="roomy" style={styles.card}>
          <View>
            {editing ? (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                autoFocus
                selectTextOnFocus
                accessibilityLabel={t("app.process.titleEditA11y")}
                placeholder={t("app.process.titlePlaceholder")}
                placeholderTextColor={colors.textTertiary}
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                returnKeyType="done"
                onBlur={() => void commitTitle()}
                onSubmitEditing={() => void commitTitle()}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === "Escape") {
                    setEditing(false);
                  }
                }}
                style={[
                  styles.titleInput,
                  {
                    color: colors.text,
                    borderColor: colors.primary,
                    backgroundColor: colors.surfaceMuted,
                  },
                ]}
              />
            ) : (
              <AppText
                variant="hero"
                lines={3}
                onPress={startEdit}
                accessibilityRole="button"
                accessibilityLabel={t("app.process.titleEditA11y")}
              >
                {current.title}
              </AppText>
            )}
          </View>

          <View style={styles.chipRow}>
            {current.priority > 0 ? (
              <Chip label={t("app.process.meta.priority", { n: current.priority })} prefix={null} />
            ) : null}
            {current.dueAt !== null ? (
              <Chip
                label={t("app.process.meta.due", {
                  date: new Date(current.dueAt).toLocaleDateString(),
                })}
                prefix={null}
              />
            ) : null}
            {contextNames.slice(0, 2).map((name) => (
              <Chip key={name} label={t("app.process.meta.context", { name })} prefix={null} />
            ))}
            {projectName !== undefined ? (
              <Chip label={t("app.process.meta.project", { name: projectName })} prefix={null} />
            ) : null}
            {isProcessed ? (
              <Chip label={t("app.process.processed")} prefix={null} />
            ) : null}
          </View>

          <View style={[styles.notesWrap, { borderLeftColor: colors.border }]}>
            {summarySource.length === 0 ? (
              <AppText variant="label" tone="tertiary" lines={1}>
                {t("app.process.notesEmpty")}
              </AppText>
            ) : (
              <MarkdownView source={summarySource} />
            )}
          </View>

          {recommendation !== null ? (
            <View style={[styles.recommend, { backgroundColor: colors.primaryMuted }]}>
              <View style={styles.recommendHead}>
                <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
                <AppText variant="label" weight="700" color={colors.primary} lines={2}>
                  {recommendationLabel}
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" lines={2}>
                {reasonLabel}
              </AppText>
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* 底部固定动作区：安全区内边距 + 2 列网格 */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.canvas,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + space.sm,
          },
        ]}
      >
        <View style={[styles.column, styles.footerInner]}>
          <AppText variant="caption" tone="tertiary" lines={1}>
            {t("app.process.actions")}
          </AppText>
          <View style={styles.grid}>
            {options.map((option, optionIndex) => (
              <View key={option.key} style={styles.gridCell}>
                <Button
                  label={
                    Platform.OS === "web"
                      ? `${String(optionIndex + 1)} · ${t(`app.${option.labelKey}`)}`
                      : t(`app.${option.labelKey}`)
                  }
                  variant={option.recommended ? "primary" : "secondary"}
                  block
                  disabled={busy}
                  accessibilityHint={t(`app.${option.hintKey}`)}
                  onPress={() => void runAction(option.key)}
                />
              </View>
            ))}
          </View>
          <View style={styles.footerRow}>
            <IconButton
              icon="chevron-back"
              variant="ghost"
              onPress={goPrev}
              disabled={index === 0}
              accessibilityLabel={t("app.process.prev")}
            />
            <AppText variant="caption" tone="tertiary" lines={1} style={styles.pageLabel}>
              {Platform.OS === "web"
                ? t("app.process.keyboardHint")
                : t("app.process.page", { index: index + 1, total })}
            </AppText>
            <IconButton
              icon="chevron-forward"
              variant="ghost"
              onPress={goNextManual}
              disabled={index >= total - 1}
              accessibilityLabel={t("app.process.next")}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  column: {
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
    paddingHorizontal: space.lg,
  },
  loadingBlock: {
    gap: space.md,
    paddingTop: space.lg,
  },
  progressBlock: {
    gap: space.xs,
    paddingBottom: space.md,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  progressTitle: {
    flexShrink: 1,
  },
  card: {
    gap: space.md,
  },
  titleInput: {
    minHeight: hit.min,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: type.hero.fontSize,
    lineHeight: type.hero.lineHeight,
    fontWeight: type.hero.fontWeight,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
  },
  notesWrap: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: space.md,
    gap: space.xs,
  },
  recommend: {
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  recommendHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerInner: {
    paddingTop: space.sm,
    gap: space.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  gridCell: {
    width: "48.5%",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  pageLabel: {
    flex: 1,
    textAlign: "center",
  },
});

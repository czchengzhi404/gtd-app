import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { AppState } from "@gtd/core";
import { buildReviewSummary, runCommand } from "@gtd/core";

import { useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Button, Card } from "../theme/primitives";
import { radius, space } from "../theme/tokens";

export interface ReviewWizardProps {
  state: AppState;
  now: number;
  onGoInbox: () => void;
  onOpenTask: (taskId: string) => void;
  onFinish: () => void;
}

const STEP_KEYS = [
  "review.steps.inbox",
  "review.steps.projects",
  "review.steps.calendar",
  "review.steps.waiting",
  "review.steps.someday",
  "review.steps.done",
] as const;

/** 每周回顾向导：6 步，每步一屏，进度条 + 底部导航按钮 */
export function ReviewWizard({ state, now, onGoInbox, onOpenTask, onFinish }: ReviewWizardProps) {
  const colors = useTheme();
  const tr = useT();
  const [step, setStep] = useState(0);
  const summary = useMemo(() => buildReviewSummary(state, now), [state, now]);

  const last = step >= STEP_KEYS.length - 1;

  const finish = async () => {
    await runCommand("settings.set", { key: "review.lastAt", value: now }).catch(() => undefined);
    onFinish();
  };

  return (
    <View style={styles.root}>
      <View style={styles.progress}>
        {STEP_KEYS.map((key, index) => (
          <View
            key={key}
            style={[
              styles.progressSegment,
              {
                backgroundColor: index <= step ? colors.primary : colors.border,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="caption" tone="tertiary" lines={1}>
          {`${step + 1} / ${STEP_KEYS.length}`}
        </AppText>
        <AppText variant="display" lines={2} style={styles.title}>
          {tr(STEP_KEYS[step] ?? "review.steps.inbox")}
        </AppText>

        <Card style={styles.card}>
          {step === 0 ? (
            <StepInbox summary={summary} tr={tr} onGoInbox={onGoInbox} />
          ) : null}
          {step === 1 ? <StepProjects summary={summary} tr={tr} /> : null}
          {step === 2 ? <StepCalendar summary={summary} tr={tr} /> : null}
          {step === 3 ? (
            <StepWaiting summary={summary} tr={tr} onOpenTask={onOpenTask} />
          ) : null}
          {step === 4 ? <StepSomeday summary={summary} tr={tr} /> : null}
          {step === 5 ? (
            <View style={styles.stepBody}>
              <AppText variant="body" lines={4}>
                {tr("review.finishBody")}
              </AppText>
              <Button label={tr("review.finish")} icon="checkmark-circle-outline" variant="primary" onPress={() => void finish()} />
            </View>
          ) : null}
        </Card>
      </ScrollView>

      <View style={[styles.navRow, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Button
          label={tr("review.prev")}
          variant="ghost"
          disabled={step === 0}
          onPress={() => setStep((s) => Math.max(0, s - 1))}
        />
        <Button
          label={tr("review.next")}
          variant="primary"
          disabled={last}
          onPress={() => setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1))}
        />
      </View>
    </View>
  );
}

/* ---------------- 各步内容 ---------------- */

interface StepProps {
  summary: ReturnType<typeof buildReviewSummary>;
  tr: (key: string, params?: Record<string, string | number>) => string;
}

function StepInbox({ summary, tr, onGoInbox }: StepProps & { onGoInbox: () => void }) {
  const colors = useTheme();
  return (
    <View style={styles.stepBody}>
      <AppText variant="body" lines={4}>
        {tr("review.inboxBody", { n: summary.inboxCount })}
      </AppText>
      {summary.inboxSample.map((task) => (
        <View key={task.id} style={styles.sampleRow}>
          <Ionicons name="ellipse" size={6} color={colors.textTertiary} />
          <AppText variant="label" tone="secondary" lines={1} style={styles.sampleText}>
            {task.title}
          </AppText>
        </View>
      ))}
      {summary.inboxCount > 0 ? (
        <Button label={tr("review.goInbox")} icon="arrow-forward" onPress={onGoInbox} />
      ) : (
        <OkLine text={tr("review.inboxClean")} />
      )}
    </View>
  );
}

function StepProjects({ summary, tr }: StepProps) {
  const colors = useTheme();
  return (
    <View style={styles.stepBody}>
      <AppText variant="body" lines={4}>
        {summary.projectsWithoutNext.length === 0 ? tr("review.projectsOk") : tr("review.projectsBody")}
      </AppText>
      {summary.projectsWithoutNext.map((p) => (
        <View key={p.projectId} style={styles.sampleRow}>
          <Ionicons name="alert-circle-outline" size={13} color={colors.warning} />
          <AppText variant="label" color={colors.warning} lines={1} style={styles.sampleText}>
            {p.name}
          </AppText>
        </View>
      ))}

      {summary.staleProjects.length > 0 ? (
        <>
          <AppText variant="caption" tone="tertiary" lines={1}>
            {tr("review.staleSection")}
          </AppText>
          {summary.staleProjects.map((p) => (
            <View key={p.projectId} style={styles.sampleRow}>
              <Ionicons name="pause-circle-outline" size={13} color={colors.textTertiary} />
              <AppText variant="label" tone="secondary" lines={1} style={styles.sampleText}>
                {tr("review.staleItem", { name: p.name, days: p.days })}
              </AppText>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function StepCalendar({ summary, tr }: StepProps) {
  const colors = useTheme();
  const max = Math.max(1, ...summary.weeklyCompletion);
  return (
    <View style={styles.stepBody}>
      <AppText variant="body" lines={5}>
        {tr("review.calendarBody", {
          completed: summary.completedLastWeek,
          upcoming: summary.upcomingCount,
        })}
      </AppText>

      <AppText variant="caption" tone="tertiary" lines={1}>
        {tr("review.trendSection")}
      </AppText>
      <View style={styles.trendRow}>
        {summary.weeklyCompletion.map((count, index) => (
          <View key={index} style={styles.trendCol}>
            <View
              style={[
                styles.trendBar,
                {
                  height: Math.max(3, Math.round((count / max) * 44)),
                  backgroundColor: count === 0 ? colors.surfaceMuted : colors.primary,
                },
              ]}
            />
            <AppText variant="caption" tone="tertiary" align="center" lines={1}>
              {String(count)}
            </AppText>
          </View>
        ))}
      </View>

      <AppText variant="caption" tone="tertiary" lines={1}>
        {tr("review.progressSection")}
      </AppText>
      <AppText variant="label" tone="secondary" lines={1}>
        {tr("review.progressValue", { done: summary.doneCount, open: summary.openCount })}
      </AppText>
    </View>
  );
}

function StepWaiting({ summary, tr, onOpenTask }: StepProps & { onOpenTask: (id: string) => void }) {
  const colors = useTheme();
  return (
    <View style={styles.stepBody}>
      <AppText variant="body" lines={4}>
        {tr("review.waitingBody", { n: summary.waitingCount })}
      </AppText>
      {summary.waitingSample.map((task) => (
        <Pressable
          key={task.id}
          accessibilityRole="button"
          accessibilityLabel={tr("task.a11yOpen", { title: task.title })}
          onPress={() => onOpenTask(task.id)}
          style={({ pressed }) => [styles.sampleRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="hourglass-outline" size={12} color={colors.textTertiary} />
          <AppText variant="label" tone="secondary" lines={1} style={styles.sampleText}>
            {task.title}
            {task.waitingFor !== null ? ` · ${task.waitingFor}` : ""}
          </AppText>
        </Pressable>
      ))}
      {summary.waitingCount === 0 ? <OkLine text={tr("more.waitingEmpty")} /> : null}
    </View>
  );
}

function StepSomeday({ summary, tr }: StepProps) {
  return (
    <View style={styles.stepBody}>
      <AppText variant="body" lines={5}>
        {tr("review.somedayBody", { n: summary.somedayCount })}
      </AppText>
    </View>
  );
}

function OkLine({ text }: { text: string }) {
  const colors = useTheme();
  return (
    <View style={styles.okRow}>
      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
      <AppText variant="label" color={colors.success} lines={1} style={styles.sampleText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  progress: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  content: {
    padding: space.lg,
    gap: space.sm,
  },
  title: {
    marginBottom: space.sm,
  },
  card: {
    gap: space.md,
  },
  stepBody: {
    gap: space.md,
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 28,
  },
  sampleText: {
    flex: 1,
    minWidth: 0,
  },
  okRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 28,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    height: 64,
    paddingTop: space.xs,
  },
  trendCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  trendBar: {
    width: "70%",
    borderRadius: 3,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
});

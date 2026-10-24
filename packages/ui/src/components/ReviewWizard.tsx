import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AppState } from "@gtd/core";
import { buildReviewSummary, runCommand } from "@gtd/core";
import { t, useT } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { radius, spacing } from "../tokens";

export interface ReviewWizardProps {
  state: AppState;
  now: number;
  /** 跳转到收集箱（处理遗留任务） */
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

/** 每周回顾向导（GTD 五步回顾 + 完成落 kv review.lastAt），文案随语言切换 */
export function ReviewWizard({ state, now, onGoInbox, onOpenTask, onFinish }: ReviewWizardProps) {
  const colors = useTheme();
  const t = useT();
  const focus = useFocusStyle(radius.sm);
  const [step, setStep] = useState(0);
  const summary = useMemo(() => buildReviewSummary(state, now), [state, now]);

  const finish = async () => {
    await runCommand("settings.set", { key: "review.lastAt", value: now }).catch(() => undefined);
    onFinish();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View accessibilityRole="tablist" style={styles.stepper}>
        {STEP_KEYS.map((labelKey, index) => (
          <View
            key={labelKey}
            style={[
              styles.stepDot,
              {
                backgroundColor: index <= step ? colors.primary : colors.border,
                opacity: index <= step ? 1 : 0.5,
              },
            ]}
          />
        ))}
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {step + 1}. {t(STEP_KEYS[step] ?? "review.steps.inbox")}
      </Text>

      {step === 0 ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: colors.text }]}>
            {t("review.inboxBody", { n: summary.inboxCount })}
          </Text>
          {summary.inboxSample.map((task) => (
            <Text key={task.id} style={[styles.sample, { color: colors.textSecondary }]}>
              · {task.title}
            </Text>
          ))}
          {summary.inboxCount > 0 ? (
            <StepButton label={t("review.goInbox")} onPress={onGoInbox} colors={colors} focus={focus} />
          ) : (
            <Text style={[styles.okText, { color: colors.success }]}>{t("review.inboxClean")}</Text>
          )}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: colors.text }]}>
            {summary.projectsWithoutNext.length === 0
              ? t("review.projectsOk")
              : t("review.projectsBody")}
          </Text>
          {summary.projectsWithoutNext.map((p) => (
            <Text key={p.projectId} style={[styles.sample, { color: colors.danger }]}>
              · {p.name}（{t(p.kind === "sequential" ? "projects.sequential" : "projects.parallel")}）
            </Text>
          ))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: colors.text }]}>
            {t("review.calendarBody", { completed: summary.completedLastWeek, upcoming: summary.upcomingCount })}
          </Text>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: colors.text }]}>
            {t("review.waitingBody", { n: summary.waitingCount })}
          </Text>
          {summary.waitingSample.map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              accessibilityLabel={t("task.a11yOpen", { title: task.title })}
              onPress={() => onOpenTask(task.id)}
              style={({ pressed }) => [styles.sampleButton, focus, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.sample, { color: colors.textSecondary }]}>
                · {task.title}
                {task.waitingFor !== null ? `（${t("more.waitingFor", { who: task.waitingFor })}）` : ""}
              </Text>
            </Pressable>
          ))}
          {summary.waitingCount === 0 ? (
            <Text style={[styles.okText, { color: colors.success }]}>{t("more.waitingEmpty")}</Text>
          ) : null}
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: colors.text }]}>
            {t("review.somedayBody", { n: summary.somedayCount })}
          </Text>
        </View>
      ) : null}

      {step === 5 ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: colors.text }]}>{t("review.finishBody")}</Text>
          <StepButton label={t("review.finish")} onPress={() => void finish()} colors={colors} focus={focus} primary />
        </View>
      ) : null}

      <View style={styles.navRow}>
        <StepButton
          label={t("review.prev")}
          disabled={step === 0}
          onPress={() => setStep((s) => Math.max(0, s - 1))}
          colors={colors}
          focus={focus}
        />
        <StepButton
          label={t("review.next")}
          disabled={step >= STEP_KEYS.length - 1}
          onPress={() => setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1))}
          colors={colors}
          focus={focus}
          primary
        />
      </View>
    </ScrollView>
  );
}

function StepButton({
  label,
  onPress,
  disabled,
  colors,
  focus,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: ReturnType<typeof useTheme>;
  focus: ReturnType<typeof useFocusStyle>;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        focus,
        {
          backgroundColor: primary === true ? colors.primary : colors.surface,
          opacity: disabled === true ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ color: primary === true ? colors.onPrimary : colors.text, fontSize: 15, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  stepper: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stepDot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  body: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  text: {
    fontSize: 16,
    lineHeight: 26,
  },
  sample: {
    fontSize: 15,
    lineHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  sampleButton: {
    borderRadius: radius.sm,
  },
  okText: {
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: spacing.xs,
  },
  navRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});

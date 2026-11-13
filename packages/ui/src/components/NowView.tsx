import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { Task } from "@gtd/core";

import { AppText } from "../theme/AppText";
import { Button } from "../theme/primitives";
import { useTheme } from "../hooks/useTheme";
import { useT } from "../i18n";
import { radius, space, type } from "../theme/tokens";

/**
 * 《纸与当下》首屏：只把「现在该做的那一件」放大，其余压成灰字队列。
 *
 * 视觉纪律（见 docs/visual-brief-paper-and-now.md）：
 * - 只有当前卡有底和边框，其余全靠字号与留白，不套第二层卡片
 * - 唯一实心按钮是「完成」，主色（赭）只出现在这里和分节标
 * - 左侧竖脊 = 装订线，不是装饰条，所有内容都从它右侧起排
 */
export interface NowViewProps {
  next: Task | null;
  rest: Task[];
  blockedCount: number;
  availableCount: number;
  now: number;
  /** 「查看全部」：切回完整列表 */
  onSeeAll: () => void;
  /** 完成当前这一件 */
  onComplete: (task: Task) => void;
  /** 点开当前这一件 */
  onOpen: (task: Task) => void;
  /** 点后续队列里的一条 */
  onOpenRest: (task: Task) => void;
}

function dueLabel(task: Task, now: number, t: ReturnType<typeof useT>): string | null {
  if (task.dueAt === null) return null;
  const d = new Date(task.dueAt);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `${t("now.dueToday")} ${time}`;
  if (task.dueAt < now) return `${t("now.overdue")} · ${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function dateHeading(now: number, t: ReturnType<typeof useT>): string {
  const d = new Date(now);
  return t("now.dateHeading", {
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: t(`now.weekday.${d.getDay()}`),
  });
}

export function NowView({
  next,
  rest,
  blockedCount,
  availableCount,
  now,
  onSeeAll,
  onComplete,
  onOpen,
  onOpenRest,
}: NowViewProps) {
  const colors = useTheme();
  const t = useT();
  const heading = useMemo(() => dateHeading(now, t), [now, t]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 页眉：极小字，只有数字用主色 */}
      <View style={styles.header}>
        <AppText variant="caption" tone="tertiary" lines={1}>
          {heading}
        </AppText>
        <AppText variant="caption" color={colors.primary} lines={1}>
          {t("now.remaining", { n: availableCount })}
        </AppText>
      </View>

      {/* 装订线：所有内容从它右侧起排 */}
      <View style={styles.spineWrap}>
        <View style={[styles.spine, { backgroundColor: colors.border }]} />

        <AppText variant="caption" tone="tertiary" lines={1} style={styles.sectionLabel}>
          {t("now.sectionNow")}
        </AppText>

        {next === null ? (
          <View style={styles.empty}>
            <AppText variant="title" lines={2} align="left">
              {t("now.allDone")}
            </AppText>
            <AppText variant="body" tone="tertiary" lines={2} align="left">
              {t("now.allDoneHint")}
            </AppText>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("now.a11yOpen", { title: next.title })}
            onPress={() => onOpen(next)}
            style={[
              styles.heroCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
              },
            ]}
          >
            <AppText variant="hero" lines={3} align="left" style={styles.heroTitle}>
              {next.title}
            </AppText>

            <View style={styles.metaRow}>
              {dueLabel(next, now, t) !== null ? (
                <AppText variant="label" color={next.dueAt !== null && next.dueAt < now ? colors.danger : colors.primary} lines={1}>
                  {dueLabel(next, now, t)}
                </AppText>
              ) : null}
              {next.priority > 0 ? (
                <AppText variant="label" tone="tertiary" lines={1}>
                  {`P${next.priority}`}
                </AppText>
              ) : null}
              {next.blockedBy.length > 0 ? (
                <AppText variant="label" tone="tertiary" lines={1}>
                  {t("now.hadPrereq")}
                </AppText>
              ) : null}
            </View>

            <View style={styles.heroAction}>
              <Button
                label={t("now.complete")}
                icon="checkmark"
                variant="primary"
                onPress={() => onComplete(next)}
              />
            </View>
          </Pressable>
        )}

        {/* 之后：灰字，不套卡片 */}
        {rest.length > 0 ? (
          <>
            <AppText variant="caption" tone="tertiary" lines={1} style={styles.sectionLabelRest}>
              {t("now.sectionLater", { n: rest.length })}
            </AppText>
            <View style={styles.restList}>
              {rest.slice(0, 4).map((task) => (
                <Pressable
                  key={task.id}
                  accessibilityRole="button"
                  accessibilityLabel={task.title}
                  onPress={() => onOpenRest(task)}
                  style={styles.restRow}
                >
                  <View style={[styles.restDot, { backgroundColor: colors.borderStrong }]} />
                  <AppText variant="body" tone="secondary" lines={1} style={styles.restTitle}>
                    {task.title}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {blockedCount > 0 ? (
          <AppText variant="caption" tone="tertiary" lines={1} style={styles.blockedNote}>
            {t("now.blockedNote", { n: blockedCount })}
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("now.seeAllA11y")}
          onPress={onSeeAll}
          style={styles.seeAll}
        >
          <AppText variant="label" color={colors.info} lines={1}>
            {t("now.seeAll", { n: availableCount })}
          </AppText>
          <Ionicons name="arrow-forward" size={14} color={colors.info} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.huge,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 2,
    marginBottom: space.xl,
  },
  spineWrap: {
    paddingLeft: space.lg,
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 8,
    width: 1.5,
    borderRadius: 1,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: space.sm,
  },
  sectionLabelRest: {
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: space.xxl,
    marginBottom: space.sm,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.xl,
    minHeight: 240,
  },
  heroTitle: {
    fontSize: type.hero.fontSize + 4,
    lineHeight: 42,
    letterSpacing: -0.3,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
  },
  heroAction: {
    alignItems: "flex-end",
    marginTop: space.xl,
  },
  restList: {
    gap: space.xs,
  },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 34,
  },
  restDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  restTitle: {
    flex: 1,
  },
  blockedNote: {
    marginTop: space.lg,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.xxl,
    minHeight: 44,
  },
  empty: {
    paddingVertical: space.xxxl,
    gap: space.sm,
  },
});

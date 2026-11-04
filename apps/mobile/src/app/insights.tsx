import { useMemo } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeader,
  Skeleton,
  StatTile,
  hit,
  radius,
  showToast,
  space,
  useAppStore,
  useTheme,
  useT,
} from "@gtd/ui";
import { computeStats, startOfDayOf } from "@gtd/core";

/**
 * 统计面板：4 个核心指标 + 14 天完成柱状图 + 项目进度 + 情境分布。
 *
 * 图表刻意用纯 View 实现（不引图表库）：柱子是普通 View，高度按最大值归一；
 * 交互只有"点击柱子看当天数值"，用 Toast 反馈，避免引入 tooltip 状态机。
 */

const CHART_DAYS = 14;
/** 柱图绘图区高度（逻辑像素；柱高按比例换算，固定值保证跨端一致） */
const CHART_HEIGHT = 160;
/** 柱子最小可见高度：0 完成也要留一条"基线点" */
const BAR_MIN_HEIGHT = 2;

export default function InsightsScreen() {
  const colors = useTheme();
  const t = useT();
  const state = useAppStore((s) => s);
  const loaded = useAppStore((s) => s.loaded);

  const stats = useMemo(() => computeStats(state, Date.now(), { days: CHART_DAYS }), [state]);
  const todayStart = startOfDayOf(Date.now());

  const maxDaily = useMemo(
    () => Math.max(1, ...stats.dailyBuckets.map((bucket) => bucket.completed)),
    [stats.dailyBuckets],
  );
  const hasDailyData = stats.dailyBuckets.some((bucket) => bucket.completed > 0);

  const projects = useMemo(
    () =>
      [...stats.byProject]
        .filter((project) => project.open + project.done > 0)
        .sort((a, b) =>
          b.open !== a.open ? b.open - a.open : b.done !== a.done ? b.done - a.done : a.name.localeCompare(b.name),
        ),
    [stats.byProject],
  );

  const contexts = useMemo(
    () =>
      [...stats.byContext]
        .filter((context) => context.open > 0)
        .sort((a, b) => b.open - a.open)
        .slice(0, 8),
    [stats.byContext],
  );
  const maxContext = Math.max(1, ...contexts.map((context) => context.open));

  if (!loaded) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
        <View style={styles.loading}>
          <Skeleton height={88} radius={radius.md} />
          <Skeleton height={88} radius={radius.md} />
          <Skeleton height={220} radius={radius.md} />
          <Skeleton height={140} radius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.column}>
        <View style={styles.tileGrid}>
          <StatTile
            label={t("app.insights.completed7d")}
            value={String(stats.completed7d)}
            icon="checkmark-done-outline"
            tone="primary"
          />
          <StatTile
            label={t("app.insights.completed30d")}
            value={String(stats.completed30d)}
            icon="calendar-outline"
            tone="info"
          />
          <StatTile
            label={t("app.insights.rate7d")}
            value={t("app.insights.percent", { value: Math.round(stats.completionRate7d * 100) })}
            icon="trending-up-outline"
            tone="success"
          />
          <StatTile
            label={t("app.insights.streak")}
            value={t("app.insights.days", { n: stats.streakDays })}
            icon="flame-outline"
            tone="warning"
          />
        </View>

        <SectionHeader
          title={t("app.insights.chartTitle")}
          trailing={
            <AppText variant="mono" tone="tertiary" lines={1}>
              {t("app.insights.throughput", { n: stats.throughputPerDay })}
            </AppText>
          }
        />
        <Card variant="outline" padding="normal">
          {!hasDailyData ? (
            <AppText variant="label" tone="tertiary" lines={1} style={styles.chartEmpty}>
              {t("app.insights.chartEmpty")}
            </AppText>
          ) : null}
          <View style={styles.chart}>
            {stats.dailyBuckets.map((bucket, bucketIndex) => {
              const isToday = bucket.dayStart === todayStart;
              const barHeight = Math.max(
                BAR_MIN_HEIGHT,
                Math.round((bucket.completed / maxDaily) * CHART_HEIGHT),
              );
              const date = new Date(bucket.dayStart);
              const dayLabel = `${String(date.getMonth() + 1)}/${String(date.getDate())}`;
              return (
                <Pressable
                  key={bucket.dayStart}
                  accessibilityRole="button"
                  accessibilityLabel={t("app.insights.chartValue", {
                    date: dayLabel,
                    n: bucket.completed,
                  })}
                  onPress={() =>
                    showToast({
                      message: t("app.insights.chartValue", {
                        date: dayLabel,
                        n: bucket.completed,
                      }),
                      tone: "info",
                    })
                  }
                  hitSlop={12}
                  style={({ pressed }) => [styles.barCell, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={[styles.barArea, { height: CHART_HEIGHT }]}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: isToday ? colors.primary : colors.primaryMuted,
                        },
                      ]}
                    />
                  </View>
                  <AppText variant="caption" tone={isToday ? "accent" : "tertiary"} lines={1}>
                    {bucketIndex % 2 === 0 ? dayLabel : ""}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <SectionHeader title={t("app.insights.byProject")} />
        {projects.length === 0 ? (
          <View style={styles.emptyBlock}>
            <EmptyState icon="folder-open-outline" title={t("app.insights.byProjectEmpty")} />
          </View>
        ) : (
          <Card variant="outline" padding="none" style={styles.listCard}>
            {projects.map((project) => {
              const total = project.open + project.done;
              const ratio = total === 0 ? 0 : project.done / total;
              return (
                <Pressable
                  key={project.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${project.name}，${t("app.insights.projectCounts", {
                    done: project.done,
                    total,
                  })}`}
                  onPress={() => router.push(`/project/${project.id}`)}
                  style={({ pressed }) => [
                    styles.projectRow,
                    { backgroundColor: pressed ? colors.surfaceMuted : "transparent" },
                  ]}
                >
                  <View style={styles.projectHead}>
                    <AppText variant="bodyStrong" lines={1} style={styles.projectName}>
                      {project.name}
                    </AppText>
                    <AppText variant="mono" tone="secondary" lines={1}>
                      {t("app.insights.projectCounts", { done: project.done, total })}
                    </AppText>
                  </View>
                  <ProgressBar value={ratio} tone={ratio >= 1 ? "success" : "primary"} />
                </Pressable>
              );
            })}
          </Card>
        )}

        <SectionHeader title={t("app.insights.byContext")} />
        {contexts.length === 0 ? (
          <View style={styles.emptyBlock}>
            <EmptyState icon="pricetags-outline" title={t("app.insights.byContextEmpty")} />
          </View>
        ) : (
          <Card variant="outline" padding="normal">
            <View style={styles.contextList}>
              {contexts.map((context) => (
                <View key={context.id} style={styles.contextRow}>
                  <AppText variant="label" tone="secondary" lines={1} style={styles.contextName}>
                    {context.name}
                  </AppText>
                  <View style={[styles.contextTrack, { backgroundColor: colors.surfaceMuted }]}>
                    <View
                      style={[
                        styles.contextFill,
                        {
                          width: `${String(Math.round((context.open / maxContext) * 100))}%` as `${number}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <AppText variant="mono" lines={1} style={styles.contextCount}>
                    {String(context.open)}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: space.xxl,
  },
  column: {
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
  },
  loading: {
    padding: space.lg,
    gap: space.md,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  chartEmpty: {
    paddingBottom: space.sm,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xxs,
    paddingTop: space.sm,
  },
  barCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "stretch",
    gap: space.xxs,
  },
  barArea: {
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  bar: {
    width: "100%",
    minHeight: BAR_MIN_HEIGHT,
    borderRadius: radius.xs,
  },
  emptyBlock: {
    paddingVertical: space.lg,
  },
  listCard: {
    marginHorizontal: space.lg,
    overflow: "hidden",
  },
  projectRow: {
    minHeight: hit.row,
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  projectHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  projectName: {
    flex: 1,
    minWidth: 0,
  },
  contextList: {
    gap: space.sm,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: hit.min,
  },
  contextName: {
    width: "30%",
  },
  contextTrack: {
    flex: 1,
    height: space.sm,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  contextFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  contextCount: {
    minWidth: space.xxxl,
    textAlign: "right",
  },
});

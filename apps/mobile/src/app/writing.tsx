import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppText,
  Card,
  PageHeader,
  SectionHeader,
  StatTile,
  useAppStore,
  useTheme,
  useT,
  radius,
  space,
} from "@gtd/ui";
import { computeWritingSummary, totalBodyWords } from "@gtd/core";
import type { WritingHistory } from "@gtd/core";

/** 曲线窗口：两周足够看出节奏，又不至于柱子细到看不清 */
const CHART_DAYS = 14;
const CHART_HEIGHT = 96;

function parseHistory(raw: string | undefined): WritingHistory {
  if (raw === undefined || raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const history: WritingHistory = {};
    for (const [day, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) history[day] = value;
    }
    return history;
  } catch {
    return {};
  }
}

/**
 * 写作统计：每日字数曲线。
 *
 * 数据来自 `kv["writing.daily"]`（每次保存正文后写入当天"总字数存量"）。
 * 曲线画的是**每日净增**（相邻存量差），因为"今天写了多少"比"库里一共多少"更有意义。
 */
export default function WritingScreen() {
  const kv = useAppStore((s) => s.kv);
  const tasks = useAppStore((s) => s.tasks);
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const t = useT();

  const history = useMemo(() => parseHistory(kv["writing.daily"]), [kv]);
  const summary = useMemo(() => computeWritingSummary(history, CHART_DAYS, Date.now()), [history]);
  const liveTotal = useMemo(() => totalBodyWords(Object.values(tasks)), [tasks]);

  const todayDelta = summary.points[summary.points.length - 1]?.delta ?? 0;
  const maxDelta = Math.max(1, ...summary.points.map((point) => Math.max(0, point.delta)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <PageHeader title={t("writing.title")} subtitle={t("writing.subtitle")} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.tiles}>
          <StatTile label={t("writing.today")} value={`${todayDelta}`} delta={t("writing.unit")} />
          <StatTile label={t("writing.span")} value={`${summary.totalDelta}`} delta={t("writing.unit")} />
        </View>
        <View style={styles.tiles}>
          <StatTile label={t("writing.total")} value={`${liveTotal}`} delta={t("writing.unit")} />
          <StatTile label={t("writing.streak")} value={`${summary.streakDays}`} delta={t("writing.days")} />
        </View>

        <SectionHeader title={t("writing.chart")} />
        <Card padding="normal">
          {summary.points.length === 0 || summary.totalDelta === 0 && liveTotal === 0 ? (
            <AppText variant="label" tone="tertiary" lines={3}>
              {t("writing.emptyHint")}
            </AppText>
          ) : (
            <>
              <View style={[styles.chart, { height: CHART_HEIGHT }]}>
                {summary.points.map((point) => {
                  const positive = Math.max(0, point.delta);
                  const height = Math.round((positive / maxDelta) * CHART_HEIGHT);
                  return (
                    <View key={point.day} style={styles.barSlot}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: Math.max(point.delta > 0 ? 2 : 0, height),
                            backgroundColor: point.delta > 0 ? colors.primary : colors.surfaceMuted,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <View style={styles.axis}>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {summary.points[0]?.day ?? ""}
                </AppText>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {t("writing.activeDays", { n: summary.activeDays })}
                </AppText>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {summary.points[summary.points.length - 1]?.day ?? ""}
                </AppText>
              </View>
            </>
          )}
        </Card>

        <AppText variant="caption" tone="tertiary" lines={3} style={styles.note}>
          {t("writing.note")}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    gap: space.sm,
    paddingBottom: space.xxxl,
  },
  tiles: {
    flexDirection: "row",
    gap: space.sm,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingTop: space.xs,
  },
  barSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: radius.xs,
    minHeight: 0,
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  note: {
    paddingHorizontal: space.xs,
  },
});

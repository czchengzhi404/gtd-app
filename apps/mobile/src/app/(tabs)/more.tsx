import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  SectionHeader,
  useAppStore,
  useTheme,
  useT,
  hit,
  radius,
  space,
  type,
} from "@gtd/ui";
import { getWaitingTasks, getSomedayTasks } from "@gtd/core";
import type { SyncConfig } from "@gtd/core";
import { resolveSyncConfig } from "@/platform/desktop-actions";
import { readPendingUpdate } from "@/platform/update-check";

/**
 * 更多：只放「低频总入口」，不再是设置大杂烩。
 *
 * 0 同步 / 1 今日回顾 / 2 任务状态（既有预览，保留） / 3 洞察 / 4 清理
 * / 6 数据 →「数据与记录」页 / 7 设置 →「设置」页。
 *
 * 拆分原则：本页每个分组最多一行入口（EntryRow）。同步配置全部搬去 `/sync`，
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

  useEffect(() => {
    void (async () => {
      // 敏感字段已经由 resolveSyncConfig 还原成明文（桌面 safeStorage / 移动 Keychain）
      const saved = await resolveSyncConfig();
      if (saved !== null) setConfig(saved);
    })();
  }, []);

  if (!loaded) return null;

  // 启动时自动检测的结果；null 表示没有新版（或还没查过）
  const pendingUpdate = readPendingUpdate(kv, Constants.expoConfig?.version ?? "0.0.0");

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

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.canvas }}>
      <View style={styles.column}>
        {/* 有新版本横幅：启动时静默查过一次 GitHub，结果在 kv 里 */}
        {pendingUpdate !== null ? (
          <Card variant="outline" padding="normal" style={styles.updateCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("update.banner", { version: pendingUpdate.version })}
              onPress={() => router.push("/about")}
              style={({ pressed }) => [styles.syncHeader, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
              <View style={styles.syncHeaderText}>
                <AppText variant="bodyStrong" lines={1}>
                  {t("update.banner", { version: pendingUpdate.version })}
                </AppText>
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {t("update.bannerHint")}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          </Card>
        ) : null}

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
  updateCard: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
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
});

import { useCallback, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  AppText,
  Badge,
  Card,
  Chip,
  EmptyState,
  Highlight,
  IconButton,
  SectionHeader,
  Skeleton,
  hit,
  radius,
  space,
  type,
  useAppStore,
  useKeyboardShortcuts,
  useTheme,
  useT,
} from "@gtd/ui";
import { quickAdd, searchAll } from "@gtd/core";
import type { SearchHit, SearchMatchedField } from "@gtd/core";

/**
 * 全局搜索：任务 / 项目分组 + 命中字段徽标 + 最近搜索。
 *
 * 说明：ui 的 SearchBar 目前不接受受控 value / autoFocus，而搜索页两者都需要
 * （最近搜索回填、进入即聚焦），因此这里的搜索框在 app 层用 TextInput + token
 * 组合实现；待 SearchBar 扩展受控能力后可无缝替换。
 */

/** 最近搜索只存本机内存（页面级模块变量），不写库、不参与同步 */
let recentQueries: string[] = [];
const MAX_RECENT = 6;

const FIELD_TONE: Record<SearchMatchedField, "accent" | "info" | "success" | "warning"> = {
  title: "accent",
  notes: "info",
  tag: "success",
  context: "warning",
};

export default function SearchScreen() {
  const colors = useTheme();
  const t = useT();
  const state = useAppStore((s) => s);
  const loaded = useAppStore((s) => s.loaded);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [recent, setRecent] = useState<string[]>(recentQueries);

  const results = useMemo(
    () => (query.trim().length === 0 ? { tasks: [], projects: [], total: 0 } : searchAll(state, query, Date.now())),
    [state, query],
  );

  const rows = useMemo(
    () => [
      ...results.tasks.map((item) => ({ hit: item, kind: "task" as const })),
      ...results.projects.map((item) => ({ hit: item, kind: "project" as const })),
    ],
    [results],
  );

  const remember = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    recentQueries = [trimmed, ...recentQueries.filter((item) => item !== trimmed)].slice(
      0,
      MAX_RECENT,
    );
    setRecent(recentQueries);
  }, []);

  const openHit = useCallback(
    (hit: SearchHit) => {
      remember(query);
      if (hit.kind === "project") router.push(`/project/${hit.id}`);
      else router.push(`/task/${hit.id}`);
    },
    [query, remember],
  );

  const createFromQuery = useCallback(async () => {
    const title = query.trim();
    if (title.length === 0) return;
    const outcome = await quickAdd(title, Date.now()).catch(() => null);
    if (outcome === null) return;
    remember(title);
    router.push(`/task/${outcome.taskId}`);
  }, [query, remember]);

  const onKey = useCallback(
    (key: string) => {
      if (key === "Escape") {
        if (router.canGoBack()) router.back();
        else router.navigate("/");
        return;
      }
      if (rows.length === 0) return;
      if (key === "ArrowDown") {
        setSelected((previous) => Math.min(rows.length - 1, previous + 1));
        return;
      }
      if (key === "ArrowUp") {
        setSelected((previous) => Math.max(0, previous - 1));
        return;
      }
      if (key === "Enter") {
        const row = rows[Math.min(selected, rows.length - 1)];
        if (row !== undefined) openHit(row.hit);
      }
    },
    [openHit, rows, selected],
  );

  const shortcuts = useMemo(
    () => [
      { key: "ArrowUp" },
      { key: "ArrowDown" },
      { key: "Enter" },
      { key: "Escape" },
    ],
    [],
  );
  useKeyboardShortcuts(shortcuts, onKey);

  const updateQuery = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  if (!loaded) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
        <View style={styles.loading}>
          <Skeleton height={hit.min} radius={radius.sm} />
          <Skeleton height={hit.row} radius={radius.md} />
          <Skeleton height={hit.row} radius={radius.md} />
          <Skeleton height={hit.row} radius={radius.md} />
        </View>
      </View>
    );
  }

  const hasQuery = query.trim().length > 0;
  const selectedRowIndex = rows.length === 0 ? -1 : Math.min(selected, rows.length - 1);

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <View style={styles.searchRow}>
        <SearchField value={query} onChangeText={updateQuery} autoFocus placeholder={t("app.search.placeholder")} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!hasQuery ? (
          <View style={styles.block}>
            <EmptyState
              icon="search-outline"
              title={t("app.search.emptyHint")}
              hint={t("app.search.emptyTip")}
            />
            <SectionHeader
              title={t("app.search.recent")}
              trailing={
                recent.length > 0 ? (
                  <IconButton
                    icon="trash-outline"
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      recentQueries = [];
                      setRecent([]);
                    }}
                    accessibilityLabel={t("app.search.clearRecent")}
                  />
                ) : null
              }
            />
            {recent.length === 0 ? (
              <AppText variant="label" tone="tertiary" lines={1} style={styles.recentEmpty}>
                {t("app.search.recentEmpty")}
              </AppText>
            ) : (
              <View style={styles.chipRow}>
                {recent.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    prefix={null}
                    onPress={() => {
                      updateQuery(item);
                      remember(item);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : results.total === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t("app.search.noResults", { query: query.trim() })}
            hint={t("app.search.noResultsHint")}
            action={{
              label: t("app.search.createTask"),
              icon: "add-circle-outline",
              onPress: () => void createFromQuery(),
            }}
          />
        ) : (
          <>
            <SectionHeader
              title={t("app.search.tasks")}
              trailing={
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {String(results.tasks.length)}
                </AppText>
              }
            />
            {results.tasks.length === 0 ? (
              <AppText variant="label" tone="tertiary" lines={1} style={styles.groupEmpty}>
                {t("app.search.noGroupResults")}
              </AppText>
            ) : (
              <Card variant="outline" padding="none" style={styles.group}>
                {results.tasks.map((item, itemIndex) => (
                  <HitRow
                    key={item.id}
                    hit={item}
                    query={query}
                    selected={selectedRowIndex === itemIndex}
                    onPress={() => openHit(item)}
                  />
                ))}
              </Card>
            )}

            <SectionHeader
              title={t("app.search.projects")}
              trailing={
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {String(results.projects.length)}
                </AppText>
              }
            />
            {results.projects.length === 0 ? (
              <AppText variant="label" tone="tertiary" lines={1} style={styles.groupEmpty}>
                {t("app.search.noGroupResults")}
              </AppText>
            ) : (
              <Card variant="outline" padding="none" style={styles.group}>
                {results.projects.map((item, itemIndex) => (
                  <HitRow
                    key={item.id}
                    hit={item}
                    query={query}
                    selected={selectedRowIndex === results.tasks.length + itemIndex}
                    onPress={() => openHit(item)}
                  />
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** 搜索输入框：受控 + 自动聚焦 + 一键清空（样式与 ui.SearchBar 同一套 token） */
function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const colors = useTheme();
  const t = useT();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.searchWrap,
        {
          backgroundColor: colors.surfaceMuted,
          borderColor: focused ? colors.primary : "transparent",
        },
      ]}
    >
      <Ionicons name="search" size={16} color={colors.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoFocus={autoFocus}
        accessibilityLabel={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        returnKeyType="search"
        style={[styles.searchInput, { color: colors.text }]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.search.clear")}
          hitSlop={8}
          onPress={() => onChangeText("")}
          style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function HitRow({
  hit: item,
  query,
  selected,
  onPress,
}: {
  hit: SearchHit;
  query: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}，${t(`app.search.field.${item.matchedField}`)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hitRow,
        {
          backgroundColor: selected ? colors.primaryMuted : pressed ? colors.surfaceMuted : "transparent",
        },
      ]}
    >
      <View style={styles.hitTitleRow}>
        <Highlight text={item.title} query={query} variant="bodyStrong" lines={1} style={styles.hitTitle} />
        <Badge
          label={t(`app.search.field.${item.matchedField}`)}
          tone={FIELD_TONE[item.matchedField]}
        />
      </View>
      {item.snippet.length > 0 && item.snippet !== item.title ? (
        <Highlight text={item.snippet} query={query} variant="caption" tone="secondary" lines={2} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchRow: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  searchWrap: {
    height: hit.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: type.body.fontSize,
    height: hit.min,
    padding: 0,
  },
  clear: {
    width: hit.min,
    height: hit.min,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  content: {
    paddingBottom: space.xxl,
  },
  loading: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
  },
  block: {
    gap: space.sm,
  },
  recentEmpty: {
    paddingHorizontal: space.lg,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  group: {
    marginHorizontal: space.lg,
    overflow: "hidden",
  },
  groupEmpty: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  hitRow: {
    minHeight: hit.row,
    justifyContent: "center",
    gap: space.xxs,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  hitTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  hitTitle: {
    flex: 1,
    minWidth: 0,
  },
});

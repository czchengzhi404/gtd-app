import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Chip } from "./Chip";
import { useT } from "../i18n";
import { radius, space } from "../theme/tokens";

export interface FilterContext {
  id: string;
  name: string;
}

export interface FilterBarProps {
  query: string;
  onQueryChange: (text: string) => void;
  contexts: FilterContext[];
  contextId: string | null;
  onContextChange: (id: string | null) => void;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
  /** 命中的任务数（用于即时反馈） */
  resultCount?: number;
}

/**
 * 筛选栏：关键词 + 情境芯片 + 只看逾期。
 * 固定高度、横向滚动的情境芯片——不换行，避免筛选区随数据变高挤压列表。
 */
export function FilterBar({
  query,
  onQueryChange,
  contexts,
  contextId,
  onContextChange,
  overdueOnly,
  onOverdueChange,
  resultCount,
}: FilterBarProps) {
  const colors = useTheme();
  const t = useT();
  const [focused, setFocused] = useState(false);

  const active = query.trim().length > 0 || contextId !== null || overdueOnly;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.search,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.primary : colors.border,
          },
        ]}
      >
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          accessibilityLabel={t("filter.searchPlaceholder")}
          placeholder={t("filter.searchPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={onQueryChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.input, { color: colors.text }]}
        />
        {active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("filter.clear")}
            onPress={() => {
              onQueryChange("");
              onContextChange(null);
              onOverdueChange(false);
            }}
            hitSlop={6}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        <Chip
          label={t("filter.overdue")}
          selected={overdueOnly}
          onPress={() => onOverdueChange(!overdueOnly)}
        />
        {contexts.map((context) => (
          <Chip
            key={context.id}
            label={context.name}
            selected={contextId === context.id}
            onPress={() => onContextChange(contextId === context.id ? null : context.id)}
          />
        ))}
        {resultCount !== undefined && active ? (
          <AppText variant="caption" tone="tertiary" lines={1}>
            {t("filter.resultCount", { n: resultCount })}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
  search: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    height: 42,
    padding: 0,
  },
  clear: {
    padding: space.xxs,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    overflow: "hidden",
  },
});

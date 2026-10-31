import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { AppText } from "../theme/AppText";
import { Chip } from "./Chip";
import { t, useT } from "../i18n";
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
  /** 标签筛选（可选） */
  tags?: string[];
  tag?: string | null;
  onTagChange?: (tag: string | null) => void;
  /**
   * 紧凑模式（宽屏用）：情境/标签/逾期 chips 收进漏斗弹层，
   * 搜索行右侧只留一个带激活数徽标的漏斗按钮——不再三层工具条叠罗汉。
   */
  compact?: boolean;
}

/** 漏斗弹层里的筛选内容（与行内 chips 同一份数据源） */
function FilterSheetBody(props: {
  contexts: FilterContext[];
  contextId: string | null;
  onContextChange: (id: string | null) => void;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
  tags: string[];
  tag: string | null;
  onTagChange?: (tag: string | null) => void;
}) {
  return (
    <View style={styles.sheetChips}>
      <Chip
        label={t("filter.overdue")}
        selected={props.overdueOnly}
        onPress={() => props.onOverdueChange(!props.overdueOnly)}
        prefix={null}
      />
      <View style={styles.sheetGroup}>
        {props.contexts.map((context) => (
          <Chip
            key={context.id}
            label={context.name}
            selected={props.contextId === context.id}
            onPress={() => props.onContextChange(props.contextId === context.id ? null : context.id)}
          />
        ))}
      </View>
      {props.onTagChange !== undefined ? (
        <View style={styles.sheetGroup}>
          {props.tags.map((name) => (
            <Chip
              key={`tag-${name}`}
              label={name}
              prefix="#"
              selected={props.tag === name}
              onPress={() => props.onTagChange?.(props.tag === name ? null : name)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * 筛选栏：关键词 + 情境/标签芯片 + 只看逾期。
 *
 * 芯片行用横向 ScrollView：情境和标签数量不设上限，换行会随数据变高挤压列表，
 * 裁剪则会让后面的 chip 不可达（触控可达性）。这里是行内滚动，不是页面横向滚动。
 * 宽屏（compact）时 chips 收进漏斗弹层，给列表让出一整行高度。
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
  tags = [],
  tag = null,
  onTagChange,
  compact = false,
}: FilterBarProps) {
  const colors = useTheme();
  const t = useT();
  const focus = useFocusStyle(radius.sm);
  const [focused, setFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const active = query.trim().length > 0 || contextId !== null || overdueOnly || tag !== null;
  const activeFilterCount = (overdueOnly ? 1 : 0) + (contextId !== null ? 1 : 0) + (tag !== null ? 1 : 0);

  const clearAll = () => {
    onQueryChange("");
    onContextChange(null);
    onOverdueChange(false);
    onTagChange?.(null);
  };

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
            onPress={clearAll}
            hitSlop={6}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : null}
        {compact ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("filter.openSheet")}
            accessibilityState={{ selected: activeFilterCount > 0 }}
            onPress={() => setSheetOpen(true)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.funnel,
              focus,
              {
                backgroundColor: activeFilterCount > 0 ? colors.primaryMuted : "transparent",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons
              name="funnel-outline"
              size={16}
              color={activeFilterCount > 0 ? colors.primary : colors.textTertiary}
            />
            {activeFilterCount > 0 ? (
              <AppText variant="caption" color={colors.primary} lines={1}>
                {`${activeFilterCount}`}
              </AppText>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {compact ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          <Chip
            label={t("filter.overdue")}
            selected={overdueOnly}
            onPress={() => onOverdueChange(!overdueOnly)}
            prefix={null}
          />
          {contexts.map((context) => (
            <Chip
              key={context.id}
              label={context.name}
              selected={contextId === context.id}
              onPress={() => onContextChange(contextId === context.id ? null : context.id)}
            />
          ))}
          {onTagChange !== undefined
            ? tags.map((name) => (
                <Chip
                  key={`tag-${name}`}
                  label={name}
                  prefix="#"
                  selected={tag === name}
                  onPress={() => onTagChange(tag === name ? null : name)}
                />
              ))
            : null}
          {resultCount !== undefined && active ? (
            <AppText variant="caption" tone="tertiary" lines={1} style={styles.count}>
              {t("filter.resultCount", { n: resultCount })}
            </AppText>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.closeMenu")}
          style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setSheetOpen(false)}
        />
        <View style={styles.sheetPos} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sheetHeader}>
              <AppText variant="title" lines={1}>
                {t("filter.openSheet")}
              </AppText>
              {resultCount !== undefined ? (
                <AppText variant="caption" tone="tertiary" lines={1}>
                  {t("filter.resultCount", { n: resultCount })}
                </AppText>
              ) : null}
            </View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <FilterSheetBody
                contexts={contexts}
                contextId={contextId}
                onContextChange={onContextChange}
                overdueOnly={overdueOnly}
                onOverdueChange={onOverdueChange}
                tags={tags}
                tag={tag}
                onTagChange={onTagChange}
              />
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.closeMenu")}
              onPress={() => setSheetOpen(false)}
              style={({ pressed }) => [
                styles.sheetDone,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <AppText variant="label" weight="600" color={colors.onPrimary} lines={1}>
                {t("common.closeMenu")}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 880,
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
    fontSize: 16,
    height: 42,
    padding: 0,
  },
  clear: {
    padding: space.xxs,
  },
  funnel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 30,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingRight: space.lg,
  },
  count: {
    marginLeft: space.xs,
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheetPos: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    maxHeight: "70%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    paddingBottom: space.sm,
  },
  sheetGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  sheetDone: {
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
  },
});

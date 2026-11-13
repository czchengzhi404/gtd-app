import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BulkActionBar,
  Button,
  FilterBar,
  IconButton,
  NowView,
  OptionSheet,
  PageHeader,
  PerspectiveBar,
  QuickAddBar,
  TaskList,
  space,
  useAppStore,
  useTheme,
  useT,
} from "@gtd/ui";
import {
  applyListFilter,
  getAllTags,
  getInboxTasks,
  parseQuickAdd,
  pickNextAction,
  quickAdd,
  runCommand,
  selectContexts,
} from "@gtd/core";
import type { DeferPreset, TaskStatusInput } from "@gtd/core";
import { useOrderedTaskActions } from "@/hooks/useRowActions";
import { useListInteractions } from "@/hooks/useListInteractions";
import { usePerspectives } from "@/hooks/usePerspectives";
import { openTaskContextMenu } from "@/lib/context-menu";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";

const MOVE_OPTIONS = [
  { key: "next", labelKey: "detail.status.next" },
  { key: "waiting", labelKey: "detail.status.waiting" },
  { key: "someday", labelKey: "detail.status.someday" },
  { key: "inbox", labelKey: "detail.status.inbox" },
] as const;

const DEFER_OPTIONS = [
  { key: "today", labelKey: "bulk.deferToday" },
  { key: "tomorrow", labelKey: "bulk.deferTomorrow" },
  { key: "nextWeek", labelKey: "bulk.deferNextWeek" },
] as const;

/**
 * 收集箱：首屏只保留「快速添加 + 一行搜索/筛选」两行。
 * 情境/标签/保存的筛选都收进漏斗弹层；视图固定为列表（收集箱里的任务还没有状态，
 * 用看板按状态分列没有意义——理清才是收集箱唯一的出口）。
 */
export default function InboxScreen() {
  const inbox = useAppStore(getInboxTasks);
  const contexts = useAppStore(selectContexts);
  const allTags = useAppStore(getAllTags);
  const loaded = useAppStore((s) => s.loaded);
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const t = useT();

  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [contextId, setContextId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [activePerspective, setActivePerspective] = useState<string | null>(null);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [deferSheetOpen, setDeferSheetOpen] = useState(false);

  /**
   * 首屏视角：默认「一张」（只看现在该做的那一件），可切回「全部」完整列表。
   * 写进 kv（settings.set），与主题/语言设置同一条路径，跨启动保留。
   */
  const focusMode = useAppStore((s) => s.kv["inbox.focusMode"]) !== "all";
  const setFocusMode = (mode: "one" | "all") => {
    void runCommand("settings.set", { key: "inbox.focusMode", value: mode }).catch(() => undefined);
  };

  const viewToggle = (
    <IconButton
      icon={focusMode ? "list-outline" : "square-outline"}
      onPress={() => setFocusMode(focusMode ? "all" : "one")}
      accessibilityLabel={focusMode ? t("now.toggleAll") : t("now.toggleOne")}
    />
  );

  const { perspectives, saveCurrent, remove } = usePerspectives();

  const filtered = useMemo(
    () => applyListFilter(inbox, { query, contextId, tag, overdueOnly }, Date.now()),
    [inbox, query, contextId, tag, overdueOnly],
  );
  const actions = useOrderedTaskActions(filtered);
  const interactions = useListInteractions(filtered);

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contexts) map[c.id] = c.name;
    return map;
  }, [contexts]);

  const preview = useMemo(() => {
    if (input.trim().length === 0) return "";
    const parsed = parseQuickAdd(input, Date.now());
    const parts: string[] = [];
    if (parsed.priority !== undefined) parts.push(`P${parsed.priority}`);
    if (parsed.dueAt !== undefined) {
      const d = new Date(parsed.dueAt);
      parts.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    if (parsed.recurrence !== undefined) {
      const rule = parsed.recurrence;
      const base = t(
        rule.freq === "daily"
          ? "recurrence.daily"
          : rule.freq === "weekly"
            ? "recurrence.weekly"
            : rule.freq === "monthly"
              ? "recurrence.monthly"
              : rule.freq === "yearly"
                ? "recurrence.yearly"
                : rule.freq === "weekdays"
                  ? "recurrence.weekdays"
                  : "recurrence.afterCompletion",
      );
      parts.push(rule.interval > 1 ? `${base} ×${rule.interval}` : base);
      if (rule.remainingCount !== undefined && rule.remainingCount !== null) {
        parts.push(t("recurrence.timesLeft", { count: rule.remainingCount }));
      }
    }
    if (parsed.projectName !== undefined) parts.push(`#${parsed.projectName}`);
    for (const name of parsed.contextNames) parts.push(`@${name}`);
    for (const name of parsed.tags) parts.push(`+${name}`);
    if (parsed.waitingFor !== undefined) parts.push(`> ${parsed.waitingFor}`);
    return `${t("inbox.previewArrow")} ${parsed.title}${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`;
  }, [input, t]);

  const submit = async (text: string) => {
    setSubmitting(true);
    setInput("");
    try {
      await quickAdd(text, Date.now());
    } finally {
      setSubmitting(false);
    }
  };

  /** 空态示例片段：点一下追加到输入框（已有内容则用空格拼接） */
  const appendSnippet = (snippet: string) => {
    setInput((prev) => (prev.trim().length === 0 ? snippet : `${prev.trimEnd()} ${snippet}`));
  };

  const suggestions = useMemo(
    () => [
      { label: t("inbox.suggest.context"), onPress: () => appendSnippet(t("inbox.suggest.context")) },
      { label: t("inbox.suggest.project"), onPress: () => appendSnippet(t("inbox.suggest.project")) },
      { label: t("inbox.suggest.priorityDate"), onPress: () => appendSnippet(t("inbox.suggest.priorityDate")) },
      { label: t("inbox.suggest.waiting"), onPress: () => appendSnippet(t("inbox.suggest.waiting")) },
    ],
    [t],
  );

  const applyPerspective = (id: string) => {
    const entry = perspectives.find((candidate) => candidate.id === id);
    if (entry === undefined) return;
    setQuery(entry.query);
    setContextId(entry.contextId);
    setTag(entry.tag);
    setOverdueOnly(entry.overdueOnly);
    setActivePerspective(id);
  };

  const clearPerspective = () => {
    setActivePerspective(null);
    setQuery("");
    setContextId(null);
    setTag(null);
    setOverdueOnly(false);
  };

  if (!loaded) return null;

  const filterActive = query.trim() !== "" || contextId !== null || tag !== null || overdueOnly;

  /**
   * 「一张」视角只在没有筛选/搜索时可用：用户一旦主动筛选，说明他想看列表，
   * 这时候还硬把内容收成一张卡就是帮倒忙。
   */
  const showNow = focusMode && !filterActive && !interactions.selectionMode && !interactions.reorderMode;
  const nowResult = useMemo(() => pickNextAction(inbox, Date.now()), [inbox]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top }}>
        <PageHeader
          title={t("nav.inbox")}
          subtitle={t("app.inbox.subtitle", { n: inbox.length })}
          actions={
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              {viewToggle}
              <IconButton
                icon="swap-vertical"
                filled={interactions.reorderMode}
                onPress={interactions.toggleReorderMode}
                accessibilityLabel={t("task.dragHandle")}
              />
              <Button
                label={t("app.inbox.process")}
                icon="layers-outline"
                variant="primary"
                accessibilityLabel={t("app.inbox.processA11y")}
                onPress={() => router.push("/process")}
              />
            </View>
          }
        />
      </View>
      <QuickAddBar
        value={input}
        onChangeText={setInput}
        preview={preview}
        onSubmit={submit}
        submitting={submitting}
      />
      {showNow ? (
        <NowView
          next={nowResult.next}
          rest={nowResult.rest}
          blockedCount={nowResult.blockedCount}
          availableCount={nowResult.availableCount}
          now={Date.now()}
          onSeeAll={() => setFocusMode("all")}
          onComplete={(task) => void completeTaskWithUndo(task)}
          onOpen={(task) => router.push(`/task/${task.id}`)}
          onOpenRest={(task) => router.push(`/task/${task.id}`)}
        />
      ) : (
        <>
      <FilterBar
        compact
        query={query}
        onQueryChange={(text) => {
          setQuery(text);
          setActivePerspective(null);
        }}
        contexts={contexts.map((c) => ({ id: c.id, name: c.name }))}
        contextId={contextId}
        onContextChange={(id) => {
          setContextId(id);
          setActivePerspective(null);
        }}
        overdueOnly={overdueOnly}
        onOverdueChange={(value) => {
          setOverdueOnly(value);
          setActivePerspective(null);
        }}
        resultCount={filtered.length}
        tags={allTags}
        tag={tag}
        onTagChange={(value) => {
          setTag(value);
          setActivePerspective(null);
        }}
        sheetExtra={
          <PerspectiveBar
            perspectives={perspectives}
            activeId={activePerspective}
            canSave={filterActive && activePerspective === null}
            onApply={applyPerspective}
            onClearActive={clearPerspective}
            onSave={() => {
              void saveCurrent({ query, contextId, tag, overdueOnly }).then((entry) => {
                if (entry !== null) setActivePerspective(entry.id);
              });
            }}
            onDelete={(id) => {
              if (activePerspective === id) setActivePerspective(null);
              void remove(id);
            }}
          />
        }
      />

      <TaskList
        tasks={filtered}
        now={Date.now()}
        contextNameById={contextNameById}
        actions={interactions.selectionMode || interactions.reorderMode ? undefined : actions}
        onContextMenuTask={(task, position) => openTaskContextMenu(task, position)}
        onToggleTask={(task) =>
          void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
        }
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        emptyIllustration="inbox"
        // 筛选生效时不能说「收集箱是空的」——任务还在，只是没匹配上。
        // 之前筛选到 0 条会显示「Inbox is empty」，而标题还写着「3 to process」，自相矛盾。
        emptyTitle={filterActive && inbox.length > 0 ? t("inbox.noMatchTitle") : t("inbox.emptyTitle")}
        emptyHint={filterActive && inbox.length > 0 ? t("inbox.noMatchHint") : t("inbox.emptyHint")}
        emptySuggestions={filterActive ? [] : suggestions}
        selectionMode={interactions.selectionMode}
        selectedIds={interactions.selectedIds}
        onToggleSelect={interactions.toggleSelect}
        onEnterSelection={interactions.enterSelection}
        onSwipeLeftTask={(task) => void interactions.swipeLeft(task)}
        onSwipeRightTask={(task) => void interactions.swipeRight(task)}
        onReorderTask={(task, toIndex) => void interactions.reorder(filtered, task, toIndex)}
        reorderMode={interactions.reorderMode}
      />
        </>
      )}

      {interactions.selectionMode ? (
        <BulkActionBar
          count={interactions.selectedIds.size}
          onComplete={() => void interactions.completeSelected()}
          onDelete={() => void interactions.deleteSelected()}
          onMove={() => setMoveSheetOpen(true)}
          onDefer={() => setDeferSheetOpen(true)}
          onClear={interactions.clearSelection}
          onExit={interactions.exitSelection}
        />
      ) : null}

      <OptionSheet
        visible={moveSheetOpen}
        title={t("bulk.moveTo")}
        options={MOVE_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
        onSelect={(key) => {
          setMoveSheetOpen(false);
          void interactions.moveSelected(key as TaskStatusInput);
        }}
        onClose={() => setMoveSheetOpen(false)}
      />

      <OptionSheet
        visible={deferSheetOpen}
        title={t("bulk.deferTo")}
        options={DEFER_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
        onSelect={(key) => {
          setDeferSheetOpen(false);
          void interactions.deferSelected(key as DeferPreset);
        }}
        onClose={() => setDeferSheetOpen(false)}
      />
    </View>
  );
}

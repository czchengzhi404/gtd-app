import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  BulkActionBar,
  FilterBar,
  KanbanBoard,
  OptionSheet,
  PerspectiveBar,
  QuickAddBar,
  TaskList,
  useAppStore,
  ViewToggle,
  useT,
} from "@gtd/ui";
import {
  applyListFilter,
  getAllTags,
  getInboxTasks,
  getTasksByStatus,
  parseQuickAdd,
  quickAdd,
  runCommand,
  selectContexts,
} from "@gtd/core";
import type { TaskStatusInput } from "@gtd/core";
import { useOrderedTaskActions } from "@/hooks/useRowActions";
import { useListInteractions } from "@/hooks/useListInteractions";
import { usePerspectives } from "@/hooks/usePerspectives";
import { openTaskContextMenu } from "@/lib/context-menu";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";

type InboxView = "list" | "kanban";

const MOVE_OPTIONS = [
  { key: "next", labelKey: "detail.status.next" },
  { key: "waiting", labelKey: "detail.status.waiting" },
  { key: "someday", labelKey: "detail.status.someday" },
  { key: "inbox", labelKey: "detail.status.inbox" },
] as const;

/** 收集箱：快速添加 + 搜索/情境/标签筛选 + 保存筛选 + 多选/滑动/拖拽 + 列表或看板 */
export default function InboxScreen() {
  const inbox = useAppStore(getInboxTasks);
  const contexts = useAppStore(selectContexts);
  const allTags = useAppStore(getAllTags);
  const nextTasks = useAppStore((s) => getTasksByStatus(s, "next"));
  const waitingTasks = useAppStore((s) => getTasksByStatus(s, "waiting"));
  const somedayTasks = useAppStore((s) => getTasksByStatus(s, "someday"));
  const loaded = useAppStore((s) => s.loaded);
  const t = useT();

  const [view, setView] = useState<InboxView>("list");
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [contextId, setContextId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [activePerspective, setActivePerspective] = useState<string | null>(null);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);

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
              : "recurrence.yearly",
      );
      parts.push(rule.interval > 1 ? `${base} ×${rule.interval}` : base);
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

  return (
    <View style={{ flex: 1 }}>
      <QuickAddBar preview={preview} onSubmit={submit} submitting={submitting} />
      <FilterBar
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
      />
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
      <ViewToggle<InboxView>
        label={t("view.inboxLabel")}
        value={view}
        onChange={setView}
        options={[
          { key: "list", label: t("view.list") },
          { key: "kanban", label: t("view.kanban") },
        ]}
      />

      {view === "list" ? (
        <TaskList
          tasks={filtered}
          now={Date.now()}
          contextNameById={contextNameById}
          actions={interactions.selectionMode ? undefined : actions}
          onContextMenuTask={(task, position) => openTaskContextMenu(task, position)}
          onToggleTask={(task) =>
            void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
          emptyTitle={t("inbox.emptyTitle")}
          emptyHint={t("inbox.emptyHint")}
          selectionMode={interactions.selectionMode}
          selectedIds={interactions.selectedIds}
          onToggleSelect={interactions.toggleSelect}
          onEnterSelection={interactions.enterSelection}
          onSwipeLeftTask={(task) => void interactions.swipeLeft(task)}
          onSwipeRightTask={(task) => void interactions.swipeRight(task)}
          onReorderTask={(task, toIndex) => void interactions.reorder(filtered, task, toIndex)}
        />
      ) : (
        <KanbanBoard
          now={Date.now()}
          actions={actions}
          columns={[
            { key: "inbox", title: t("detail.status.inbox"), status: "inbox", tasks: filtered },
            { key: "next", title: t("detail.status.next"), status: "next", tasks: nextTasks },
            { key: "waiting", title: t("detail.status.waiting"), status: "waiting", tasks: waitingTasks },
            { key: "someday", title: t("detail.status.someday"), status: "someday", tasks: somedayTasks },
          ]}
          onMoveTask={(task, status) =>
            void runCommand("task.moveStatus", { id: task.id, status }).catch(() => undefined)
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
        />
      )}

      {interactions.selectionMode ? (
        <BulkActionBar
          count={interactions.selectedIds.size}
          onComplete={() => void interactions.completeSelected()}
          onDelete={() => void interactions.deleteSelected()}
          onMove={() => setMoveSheetOpen(true)}
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
    </View>
  );
}

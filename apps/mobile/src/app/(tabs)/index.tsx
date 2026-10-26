import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  FilterBar,
  KanbanBoard,
  QuickAddBar,
  TaskList,
  useAppStore,
  ViewToggle,
  useT,
} from "@gtd/ui";
import {
  applyListFilter,
  getInboxTasks,
  getTasksByStatus,
  parseQuickAdd,
  quickAdd,
  selectContexts,
} from "@gtd/core";
import { useOrderedTaskActions } from "@/hooks/useRowActions";
import { completeTaskWithUndo, uncompleteTask } from "@/lib/task-ops";

type InboxView = "list" | "kanban";

/** 收集箱：快速添加 + 搜索/情境筛选 + 列表或看板 */
export default function InboxScreen() {
  const inbox = useAppStore(getInboxTasks);
  const contexts = useAppStore(selectContexts);
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
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filtered = useMemo(
    () => applyListFilter(inbox, { query, contextId, overdueOnly }, Date.now()),
    [inbox, query, contextId, overdueOnly],
  );
  const actions = useOrderedTaskActions(filtered);

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

  if (!loaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <QuickAddBar preview={preview} onSubmit={submit} submitting={submitting} />
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        contexts={contexts.map((c) => ({ id: c.id, name: c.name }))}
        contextId={contextId}
        onContextChange={setContextId}
        overdueOnly={overdueOnly}
        onOverdueChange={setOverdueOnly}
        resultCount={filtered.length}
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
          actions={actions}
          onToggleTask={(task) =>
            void (task.status === "done" ? uncompleteTask(task) : completeTaskWithUndo(task))
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
          emptyTitle={t("inbox.emptyTitle")}
          emptyHint={t("inbox.emptyHint")}
        />
      ) : (
        <KanbanBoard
          now={Date.now()}
          actions={actions}
          columns={[
            { key: "inbox", title: t("detail.status.inbox"), tasks: filtered },
            { key: "next", title: t("detail.status.next"), tasks: nextTasks },
            { key: "waiting", title: t("detail.status.waiting"), tasks: waitingTasks },
            { key: "someday", title: t("detail.status.someday"), tasks: somedayTasks },
          ]}
          onPressTask={(task) => router.push(`/task/${task.id}`)}
        />
      )}
    </View>
  );
}

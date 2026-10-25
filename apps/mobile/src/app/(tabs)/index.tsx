import { useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import { KanbanBoard, QuickAddBar, TaskList, useAppStore, ViewToggle, useT } from "@gtd/ui";
import {
  getInboxTasks,
  getTasksByStatus,
  parseQuickAdd,
  quickAdd,
  runCommand,
  selectContexts,
} from "@gtd/core";
import { useTaskActions } from "@/hooks/useRowActions";

type InboxView = "list" | "kanban";

/** 收集箱：快速添加 + 列表/看板切换（看板覆盖四个 GTD 状态，便于横向理清） */
export default function InboxScreen() {
  const tasks = useAppStore(getInboxTasks);
  const contexts = useAppStore(selectContexts);
  const nextTasks = useAppStore((s) => getTasksByStatus(s, "next"));
  const waitingTasks = useAppStore((s) => getTasksByStatus(s, "waiting"));
  const somedayTasks = useAppStore((s) => getTasksByStatus(s, "someday"));
  const loaded = useAppStore((s) => s.loaded);
  const t = useT();
  const taskActions = useTaskActions();
  const [view, setView] = useState<InboxView>("list");
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");

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
      parts.push(
        t(
          parsed.recurrence.freq === "daily"
            ? "recurrence.daily"
            : parsed.recurrence.freq === "weekly"
              ? "recurrence.weekly"
              : parsed.recurrence.freq === "monthly"
                ? "recurrence.monthly"
                : "recurrence.yearly",
        ),
      );
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
          tasks={tasks}
          now={Date.now()}
          contextNameById={contextNameById}
          actions={taskActions}
          onToggleTask={(task) =>
            void runCommand(
              task.status === "done" ? "task.uncomplete" : "task.complete",
              { id: task.id },
            ).catch(() => undefined)
          }
          onPressTask={(task) => router.push(`/task/${task.id}`)}
          emptyTitle={t("inbox.emptyTitle")}
          emptyHint={t("inbox.emptyHint")}
        />
      ) : (
        <KanbanBoard
          now={Date.now()}
          actions={taskActions}
          columns={[
            { key: "inbox", title: t("detail.status.inbox"), tasks },
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

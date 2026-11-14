import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { View } from "react-native";

import {
  Screen,
  TaskDetailContent,
  OptionSheet,
  showConfirm,
  showPrompt,
  showToast,
  useAppStore,
  useT,
} from "@gtd/ui";
import {
  appStore,
  getAllTags,
  getAttachmentsForTask,
  getSqliteExecutor,
  prereqCandidates,
  recordDailyWords,
  runCommand,
  selectActiveProjects,
  selectContexts,
  selectTaskById,
  totalBodyWords,
} from "@gtd/core";
import type { WritingHistory } from "@gtd/core";
import type { AttachmentMeta, TaskStatusInput } from "@gtd/core";
import {
  addAttachmentFromDialog,
  addAttachmentFromPicker,
  addChecklistItem,
  deleteTaskWithUndo,
  removeChecklistItem,
  toggleChecklistItem,
} from "@/lib/task-ops";
import { exportNote } from "@/platform/export-actions";
import { isDesktop } from "@/platform/env";

/** 任务详情：状态流转、优先级、标签、专注、清单子项、附件、删除（可撤销） */
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = typeof id === "string" ? id : "";
  const task = useAppStore((s) => selectTaskById(s, taskId));
  const contexts = useAppStore(selectContexts);
  const projects = useAppStore(selectActiveProjects);
  const tagSuggestions = useAppStore(getAllTags);
  const t = useT();
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [prereqSheetOpen, setPrereqSheetOpen] = useState(false);

  const reloadAttachments = async (targetId: string) => {
    const list = await getAttachmentsForTask(getSqliteExecutor(), targetId).catch(() => []);
    setAttachments(list);
  };

  useEffect(() => {
    if (taskId.length === 0) return;
    void reloadAttachments(taskId);
  }, [taskId, task?.revision]);

  if (task === null) return <Screen>{null}</Screen>;

  const contextNames = task.contextIds
    .map((cid) => contexts.find((c) => c.id === cid)?.name)
    .filter((n): n is string => n !== undefined);
  const projectName = projects.find((p) => p.id === task.projectId)?.name;

  // 所属项目下的分区：只有任务挂了项目、且项目里建过分区时才显示选择区
  const taskSections = Object.values(appStore.getState().sections)
    .filter((s) => s.deletedAt === null && s.projectId === task.projectId)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))
    .map((s) => ({ id: s.id, name: s.name }));

  /**
   * 先后关系：本任务要等哪些事项做完。
   * 候选由 prereqCandidates 过滤掉「自己」和「加了会成环的」——
   * 成环会让两个任务永远互为未完成前置，静默地从首屏消失。
   */
  const allTasks = Object.values(appStore.getState().tasks);
  const selectedIds = task.blockedBy ?? [];
  const prereqs = selectedIds
    .map((pid) => allTasks.find((candidate) => candidate.id === pid))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      done: candidate.status === "done",
    }));
  const candidates = prereqCandidates(allTasks, task.id).filter(
    (candidate) => !selectedIds.includes(candidate.id),
  );

  const addPrereq = (prereqId: string) => {
    setPrereqSheetOpen(false);
    void runCommand("task.update", {
      id: task.id,
      patch: { blockedBy: [...selectedIds, prereqId] },
    }).catch(() => undefined);
  };
  const removePrereq = (prereqId: string) => {
    void runCommand("task.update", {
      id: task.id,
      patch: { blockedBy: selectedIds.filter((pid) => pid !== prereqId) },
    }).catch(() => undefined);
  };

  const confirmDelete = async () => {
    const ok = await showConfirm({
      title: t("detail.deleteConfirm"),
      message: t("detail.deleteConfirmBody", { title: task.title }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    await deleteTaskWithUndo(task);
    if (router.canGoBack()) router.back();
  };

  /** 保存正文后记录"当天全库字数"快照，供写作统计画曲线 */
  const recordWritingSnapshot = async () => {
    const state = appStore.getState();
    let history: WritingHistory = {};
    try {
      const raw = state.kv["writing.daily"];
      if (raw !== undefined && raw.length > 0) history = JSON.parse(raw) as WritingHistory;
    } catch {
      history = {};
    }
    const total = totalBodyWords(Object.values(state.tasks));
    await runCommand("settings.set", {
      key: "writing.daily",
      value: JSON.stringify(recordDailyWords(history, total, Date.now())),
    }).catch(() => undefined);
  };

  const saveAsTemplate = async () => {
    const name = await showPrompt({
      title: t("template.savePrompt"),
      placeholder: task.title,
    });
    if (name === null || name.trim().length === 0) return;
    try {
      await runCommand("template.upsert", {
        name: name.trim(),
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        projectId: task.projectId,
        contextIds: task.contextIds,
        tags: task.tags,
        checklist: task.checklist,
        recurrence: task.recurrence,
      });
      showToast({ message: t("template.saved"), tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ message: t("template.useFailed", { message }), tone: "danger" });
    }
  };

  const pickAttachment = async () => {
    if (isDesktop()) {
      await addAttachmentFromDialog(task);
    } else {
      await addAttachmentFromPicker(task);
    }
    await reloadAttachments(task.id);
  };

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <TaskDetailContent
          task={task}
          now={Date.now()}
          projectName={projectName}
          sections={taskSections}
          onSetSection={(sectionId) =>
            void runCommand("task.update", { id: task.id, patch: { sectionId } }).catch(() => undefined)
          }
          prereqs={prereqs}
          onAddPrereq={() => setPrereqSheetOpen(true)}
          onRemovePrereq={removePrereq}
          contextNames={contextNames}
          tagSuggestions={tagSuggestions}
          onMoveStatus={(status: TaskStatusInput) =>
            void runCommand("task.moveStatus", { id: task.id, status }).catch(() => undefined)
          }
          onToggleStar={() =>
            void runCommand("task.update", {
              id: task.id,
              patch: { starred: !task.starred },
            }).catch(() => undefined)
          }
          onSetPriority={(priority) =>
            void runCommand("task.update", { id: task.id, patch: { priority } }).catch(() => undefined)
          }
          onSetDefer={(until) =>
            void runCommand("task.update", { id: task.id, patch: { deferUntil: until } }).catch(
              () => undefined,
            )
          }
          onSetRecurrence={(rule) =>
            void runCommand("task.update", { id: task.id, patch: { recurrence: rule } }).catch(
              () => undefined,
            )
          }
          onSaveAsTemplate={() => void saveAsTemplate()}
          onOpenHistory={() => router.push(`/history?taskId=${task.id}`)}
          onExportNotes={() => {
            void exportNote(task.title, task.notes).then((result) => {
              if (result === null) return;
              showToast({
                message:
                  result.mode === "saved"
                    ? t("app.more.exportSaved", { name: result.fileName })
                    : t("app.more.exportShared", { name: result.fileName }),
                tone: "success",
              });
            });
          }}
          onSaveNotes={async (notes) => {
            try {
              await runCommand("task.update", { id: task.id, patch: { notes } });
              await recordWritingSnapshot();
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              showToast({ message: t("detail.notesSaveFailed", { message }), tone: "danger" });
            }
          }}
          onSetTags={(tags) =>
            void runCommand("task.update", { id: task.id, patch: { tags } }).catch(() => undefined)
          }
          onDelete={() => void confirmDelete()}
          onToggleChecklist={(itemId) => void toggleChecklistItem(task, itemId)}
          onAddChecklist={(title) => void addChecklistItem(task, title)}
          onRemoveChecklist={(itemId) => void removeChecklistItem(task, itemId)}
          attachments={attachments}
          onAddAttachment={() => void pickAttachment()}
          onRemoveAttachment={(attachmentId) =>
            void runCommand("attachment.remove", { id: attachmentId })
              .then(() => reloadAttachments(task.id))
              .catch(() => undefined)
          }
        />
      </View>

      <OptionSheet
        visible={prereqSheetOpen}
        title={t("dep.add")}
        options={
          candidates.length > 0
            ? candidates.map((candidate) => ({ key: candidate.id, label: candidate.title }))
            : [{ key: "__none__", label: t("dep.noCandidates") }]
        }
        onSelect={(key) => {
          if (key !== "__none__") addPrereq(key);
          else setPrereqSheetOpen(false);
        }}
        onClose={() => setPrereqSheetOpen(false)}
      />
    </Screen>
  );
}

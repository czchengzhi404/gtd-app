import { createStore } from "zustand/vanilla";
import type { CommandMap, CommandOp, CommandResult, TaggedRecord } from "../models/commands";
import type { Context, Project, Section, Task } from "../models/task";
import { executeCommand, type CommandContext } from "../db/commands";
import { loadBootstrapData } from "../db/queries";
import { getCommandPort, getSqliteExecutor } from "../platform/ports";
import { parseQuickAdd } from "../features/quick-add";
import type { RecurrenceRule } from "../models/task";

/**
 * 应用状态容器（zustand/vanilla，无 React 依赖）。
 * React 绑定在 packages/ui（useStore(appStore, selector)）。
 *
 * 写路径：runCommand → CommandPort.dispatch（mobile 本地 / desktop IPC）→
 * 用返回的变更记录 reconcile 本地状态（命令是唯一写入口，状态不自行变更）。
 */

export interface AppState {
  loaded: boolean;
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  sections: Record<string, Section>;
  contexts: Record<string, Context>;
  /** 设置（不参与同步） */
  kv: Record<string, string>;
  lastError: string | null;
}

export const appStore = createStore<AppState>(() => ({
  loaded: false,
  tasks: {},
  projects: {},
  sections: {},
  contexts: {},
  kv: {},
  lastError: null,
}));

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of items) {
    result[item.id] = item;
  }
  return result;
}

export function applyRecords(records: TaggedRecord[]): void {
  if (records.length === 0) return;
  appStore.setState((state) => {
    const tasks = { ...state.tasks };
    const projects = { ...state.projects };
    const sections = { ...state.sections };
    const contexts = { ...state.contexts };
    for (const { type, record } of records) {
      switch (type) {
        case "task":
          if (record.deletedAt !== null) {
            delete tasks[record.id];
          } else {
            tasks[record.id] = record as Task;
          }
          break;
        case "project":
          if (record.deletedAt !== null) {
            delete projects[record.id];
          } else {
            projects[record.id] = record as Project;
          }
          break;
        case "section":
          if (record.deletedAt !== null) {
            delete sections[record.id];
          } else {
            sections[record.id] = record as Section;
          }
          break;
        case "context":
          if (record.deletedAt !== null) {
            delete contexts[record.id];
          } else {
            contexts[record.id] = record as Context;
          }
          break;
        case "attachment":
          // 附件元数据由详情页按需查询，暂不进全局状态
          break;
      }
    }
    return { tasks, projects, sections, contexts };
  });
}

export async function bootstrapStore(): Promise<void> {
  const data = await loadBootstrapData(getSqliteExecutor());
  appStore.setState({
    loaded: true,
    tasks: indexById(data.tasks),
    projects: indexById(data.projects),
    sections: indexById(data.sections),
    contexts: indexById(data.contexts),
    kv: data.kv,
    lastError: null,
  });
}

export async function runCommand<K extends CommandOp>(
  op: K,
  payload: CommandMap[K],
): Promise<CommandResult> {
  try {
    const result = await getCommandPort().dispatch(op, payload);
    applyRecords(result.records);
    // settings.set 不返回记录：本地同步更新 kv（通知去重键等依赖即时可见）
    if (op === "settings.set") {
      const { key, value } = payload as { key: string; value: string | number | boolean | null };
      appStore.setState((s) => ({ kv: { ...s.kv, [key]: String(value) } }));
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appStore.setState({ lastError: message });
    throw err;
  }
}

/** 直接对给定 executor 执行命令（主进程/测试用；渲染进程走 runCommand） */
export async function executeCommandOn(
  executor: Parameters<typeof executeCommand>[0],
  op: CommandOp,
  payload: unknown,
  ctx: CommandContext,
): Promise<CommandResult> {
  return executeCommand(executor, op, payload, ctx);
}

export interface QuickAddOutcome {
  taskId: string;
}

/**
 * 快速添加：解析 → 解析/创建情境与项目 → task.create。
 * 逐条命令执行（每条自身是 immediate 事务）；情境与项目为 find-or-create 语义，
 * 不与 task.create 捆绑成一个事务——创建顺序失败可重试且幂等。
 */
export async function quickAdd(rawInput: string, now: number): Promise<QuickAddOutcome> {
  const parsed = parseQuickAdd(rawInput, now);
  if (parsed.title.length === 0) {
    throw new Error("快速添加内容为空");
  }
  const contextIds: string[] = [];
  for (const name of parsed.contextNames) {
    const result = await runCommand("context.upsert", { name });
    const record = result.records[0]?.record;
    if (record && "name" in record) {
      contextIds.push(record.id);
    }
  }
  let projectId: string | undefined;
  if (parsed.projectName !== undefined) {
    // 本地状态判重（bootstrap 后与库一致）；未命中则创建
    const lowered = parsed.projectName.toLowerCase();
    const found = Object.values(appStore.getState().projects).find(
      (p) => p.deletedAt === null && p.name.toLowerCase() === lowered,
    );
    if (found) {
      projectId = found.id;
    } else {
      const result = await runCommand("project.upsert", {
        name: parsed.projectName,
        kind: "parallel",
      });
      const record = result.records[0]?.record;
      if (record && "kind" in record) {
        projectId = record.id;
      }
    }
  }
  const status = parsed.suggestsWaiting ? "waiting" : "inbox";
  const created = await runCommand("task.create", {
    title: parsed.title,
    status,
    priority: parsed.priority,
    dueAt: parsed.dueAt ?? null,
    projectId: projectId ?? null,
    contextIds,
    waitingFor: parsed.waitingFor ?? null,
    recurrence: (parsed.recurrence ?? null) as RecurrenceRule | null,
  });
  const taskRecord = created.records[0]?.record;
  if (!taskRecord || !("title" in taskRecord)) {
    throw new Error("task.create 未返回任务记录");
  }
  return { taskId: taskRecord.id };
}

export type { CommandMap, CommandOp, CommandResult };

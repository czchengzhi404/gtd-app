import type { TaggedRecord } from "../models/commands";
import type { Area, Context, Project, Section, Task, TaskTemplate } from "../models/task";
import type { AppState } from "../store/app-store";

/**
 * 导出器：纯字符串构建器（无 DOM、无文件系统、无 React）。
 * 输入只读，输出确定——同一 state/now 永远得到同一字符串。
 */

export interface MarkdownExportOptions {
  /** 是否包含已完成任务（默认 false：只导出未完成清单） */
  includeCompleted?: boolean;
  /** 是否把笔记压成一行引用附在任务下（默认 false） */
  includeNotes?: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownText(value: string): string {
  return collapseWhitespace(value).replace(/([\[\]])/g, "\\$1");
}

function formatLocalDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 到期时间：只有日期时输出 `2026-11-07`；带具体时刻时输出 `2026-11-07 15:30`。
 *
 * 18:00 是"只写日期"的约定时刻（快速添加与 CSV 导入的默认），
 * 因此 18:00 仍按纯日期输出——否则所有任务都会多出一个假的时刻，
 * 来回导入导出后全部变味。
 */
function formatDueStamp(ms: number): string {
  const date = new Date(ms);
  if (date.getHours() === 18 && date.getMinutes() === 0) return formatLocalDate(ms);
  return `${formatLocalDate(ms)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function byOrder(a: Task, b: Task): number {
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byCreatedAt(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 未完成任务清单，按「区域 → 项目 → 任务」分组。
 * 无项目任务进「收集箱」，项目所属区域被删/缺失时回落到「未归类」。
 * 标题中的 `[` / `]` 转义，避免破坏 Markdown 复选框与链接语法。
 */
export function toMarkdown(state: AppState, opts?: MarkdownExportOptions): string {
  const includeCompleted = opts?.includeCompleted === true;
  const includeNotes = opts?.includeNotes === true;

  const areas: Area[] = Object.values(state.areas)
    .filter((area) => area.deletedAt === null)
    .sort((a, b) => {
      if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
      return byCreatedAt(a, b);
    });

  const projects: Project[] = Object.values(state.projects)
    .filter((project) => project.deletedAt === null)
    .sort(byCreatedAt);

  const contextNameById = new Map<string, string>();
  for (const context of Object.values(state.contexts)) {
    if (context.deletedAt === null) contextNameById.set(context.id, context.name);
  }

  const liveTasks = Object.values(state.tasks)
    .filter((task) => task.deletedAt === null)
    .filter((task) => includeCompleted || task.status !== "done")
    .sort(byOrder);

  const projectIds = new Set(projects.map((project) => project.id));
  const tasksByProject = new Map<string, Task[]>();
  const inboxTasks: Task[] = [];
  for (const task of liveTasks) {
    if (task.projectId !== null && projectIds.has(task.projectId)) {
      const list = tasksByProject.get(task.projectId) ?? [];
      list.push(task);
      tasksByProject.set(task.projectId, list);
    } else {
      inboxTasks.push(task);
    }
  }

  const areaIdByProject = new Map<string, string | null>();
  for (const project of projects) {
    const area = project.areaId === null
      ? undefined
      : areas.find((candidate) => candidate.id === project.areaId);
    areaIdByProject.set(project.id, area?.id ?? null);
  }

  const lines: string[] = ["# GTD 清单", ""];

  const appendTask = (task: Task): void => {
    const checkbox = task.status === "done" ? "x" : " ";
    const parts = [`- [${checkbox}] ${escapeMarkdownText(task.title)}`];
    if (task.dueAt !== null) parts.push(`📅 ${formatDueStamp(task.dueAt)}`);
    if (task.priority === 3) parts.push("!!!");
    else if (task.priority === 2) parts.push("!!");
    else if (task.priority === 1) parts.push("!");
    for (const tag of task.tags) parts.push(`#${tag}`);
    for (const contextId of task.contextIds) {
      const name = contextNameById.get(contextId);
      if (name !== undefined) parts.push(`@${name}`);
    }
    let line = parts.join(" ");
    if (includeNotes && task.notes.trim().length > 0) {
      line += `\n  > ${collapseWhitespace(task.notes)}`;
    }
    lines.push(line);
  };

  const appendProject = (project: Project): void => {
    const projectTasks = tasksByProject.get(project.id) ?? [];
    if (projectTasks.length === 0) return;
    lines.push(`### ${escapeMarkdownText(project.name)}`);
    for (const task of projectTasks) appendTask(task);
    lines.push("");
  };

  for (const area of areas) {
    const areaProjects = projects.filter((project) => areaIdByProject.get(project.id) === area.id);
    const hasContent = areaProjects.some(
      (project) => (tasksByProject.get(project.id) ?? []).length > 0,
    );
    if (!hasContent) continue;
    lines.push(`## ${escapeMarkdownText(area.name)}`);
    for (const project of areaProjects) appendProject(project);
  }

  const unclassifiedProjects = projects.filter((project) => areaIdByProject.get(project.id) === null);
  const hasUnclassifiedProjects = unclassifiedProjects.some(
    (project) => (tasksByProject.get(project.id) ?? []).length > 0,
  );
  if (hasUnclassifiedProjects || inboxTasks.length > 0) {
    lines.push("## 未归类");
    for (const project of unclassifiedProjects) appendProject(project);
    if (inboxTasks.length > 0) {
      lines.push("### 收集箱");
      for (const task of inboxTasks) appendTask(task);
      lines.push("");
    }
  }

  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

/* ---------------- iCalendar ---------------- */

function utf8ByteLength(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * RFC 5545 折行：首行最多 75 octets，续行以 1 个空格开头、内容最多 74 octets。
 * 按 Unicode 码点切分，绝不会截断多字节字符。
 */
function foldLine(line: string): string {
  const chars = Array.from(line);
  if (chars.length === 0) return "";
  const chunks: string[] = [];
  let index = 0;
  let first = true;

  while (index < chars.length) {
    const limit = first ? 75 : 74;
    let chunk = "";
    let bytes = 0;
    while (index < chars.length) {
      const char = chars[index] as string;
      const size = utf8ByteLength(char);
      if (bytes + size > limit && chunk.length > 0) break;
      chunk += char;
      bytes += size;
      index += 1;
    }
    chunks.push(first ? chunk : ` ${chunk}`);
    first = false;
  }

  return chunks.join("\r\n");
}

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function formatICSDateLocal(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

function formatICSDateUTC(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(
    date.getUTCDate(),
  )}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

/**
 * 任务 → iCalendar。仅有 dueAt 的任务生成事件（DTSTART=dueAt，
 * DTEND=dueAt+30 分钟）；UID 稳定为 `<taskId>@gtd`，重复导出不会产生重复事件。
 * 行尾一律 CRLF，所有内容行按 75 octet 折行。
 */
export function toICS(tasks: Task[], now: number): string {
  const events = tasks
    .filter((task) => task.deletedAt === null && task.dueAt !== null)
    .sort((a, b) => {
      const dueA = a.dueAt ?? 0;
      const dueB = b.dueAt ?? 0;
      if (dueA !== dueB) return dueA - dueB;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GTD List//CN//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const task of events) {
    const dueAt = task.dueAt;
    if (dueAt === null) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@gtd`,
      `DTSTAMP:${formatICSDateUTC(now)}`,
      `DTSTART:${formatICSDateLocal(dueAt)}`,
      `DTEND:${formatICSDateLocal(dueAt + 30 * 60_000)}`,
      `SUMMARY:${escapeICS(task.title)}`,
      `DESCRIPTION:${escapeICS(task.notes)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/* ---------------- 备份 JSON ---------------- */

function sortById<T extends { id: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function taskBackupRecord(task: Task): Task {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    deferUntil: task.deferUntil,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    lastCompletedAt: task.lastCompletedAt,
    projectId: task.projectId,
    sectionId: task.sectionId,
    contextIds: [...task.contextIds],
    tags: [...task.tags],
    waitingFor: task.waitingFor,
    starred: task.starred,
    recurrence:
      task.recurrence === null
        ? null
        : {
            freq: task.recurrence.freq,
            interval: task.recurrence.interval,
            byWeekday: task.recurrence.byWeekday,
            lastWeekday: task.recurrence.lastWeekday,
            remainingCount: task.recurrence.remainingCount,
            until: task.recurrence.until,
          },
    checklist: task.checklist.map((item) => ({
      id: item.id,
      title: item.title,
      done: item.done,
      orderKey: item.orderKey,
    })),
    orderKey: task.orderKey,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    revision: task.revision,
    deletedAt: task.deletedAt,
  };
}

function projectBackupRecord(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    kind: project.kind,
    status: project.status,
    color: project.color,
    areaId: project.areaId,
    reviewIntervalDays: project.reviewIntervalDays,
    lastReviewedAt: project.lastReviewedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    revision: project.revision,
    deletedAt: project.deletedAt,
  };
}

function sectionBackupRecord(section: Section): Section {
  return {
    id: section.id,
    projectId: section.projectId,
    name: section.name,
    orderKey: section.orderKey,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
    revision: section.revision,
    deletedAt: section.deletedAt,
  };
}

function contextBackupRecord(context: Context): Context {
  return {
    id: context.id,
    name: context.name,
    color: context.color,
    icon: context.icon,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
    revision: context.revision,
    deletedAt: context.deletedAt,
  };
}

function areaBackupRecord(area: Area): Area {
  return {
    id: area.id,
    name: area.name,
    color: area.color,
    orderKey: area.orderKey,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
    revision: area.revision,
    deletedAt: area.deletedAt,
  };
}

function templateBackupRecord(template: TaskTemplate): TaskTemplate {
  return {
    id: template.id,
    name: template.name,
    title: template.title,
    notes: template.notes,
    priority: template.priority,
    projectId: template.projectId,
    contextIds: [...template.contextIds],
    tags: [...template.tags],
    checklist: template.checklist.map((item) => ({ ...item })),
    recurrence: template.recurrence === null ? null : { ...template.recurrence },
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    revision: template.revision,
    deletedAt: template.deletedAt,
  };
}

/**
 * 稳定备份 JSON：记录按 id 排序、字段按显式顺序重建，
 * 2 空格缩进。相同数据无论对象插入顺序如何都得到逐字节相同的字符串，
 * 便于签名/对比/云备份去重。
 *
 * 信封与 `exportAllToFile` / 云端备份 / `importFromFile` **完全一致**：
 * `{ app: "gtd", version: 1, exportedAt, records }`，保证"导出的文件能直接导回"。
 *
 * `now` 必须显式传入（不读系统时钟），否则无法保证可测的确定性。
 * 注意：state 里没有附件元数据；需要完整备份（含附件）请用
 * `formatBackupJSON(await collectLocalRecords(executor), now)`。
 */
export function toBackupJSON(state: AppState, now: number): string {
  const records: TaggedRecord[] = [
    ...sortById(Object.values(state.tasks)).map((task) => ({
      type: "task" as const,
      record: taskBackupRecord(task),
    })),
    ...sortById(Object.values(state.projects)).map((project) => ({
      type: "project" as const,
      record: projectBackupRecord(project),
    })),
    ...sortById(Object.values(state.sections)).map((section) => ({
      type: "section" as const,
      record: sectionBackupRecord(section),
    })),
    ...sortById(Object.values(state.contexts)).map((context) => ({
      type: "context" as const,
      record: contextBackupRecord(context),
    })),
    ...sortById(Object.values(state.areas)).map((area) => ({
      type: "area" as const,
      record: areaBackupRecord(area),
    })),
    ...sortById(Object.values(state.templates)).map((template) => ({
      type: "template" as const,
      record: templateBackupRecord(template),
    })),
  ].sort((a, b) => (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0));

  return formatBackupJSON(records, now);
}

/**
 * 把已收集的记录格式化成标准备份信封（含附件元数据的最小完整实现）。
 * 记录按 id 排序，保证同输入得到逐字节相同的字符串。
 */
export function formatBackupJSON(records: readonly TaggedRecord[], now: number): string {
  const ordered = [...records].sort((a, b) =>
    a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0,
  );
  const payload = {
    app: "gtd",
    version: 1,
    exportedAt: now,
    records: ordered,
  };
  return JSON.stringify(payload, null, 2);
}

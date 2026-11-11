import type { TaskStatusInput } from "../models/task";
import { parseQuickAdd } from "./quick-add";

/**
 * 导入器（纯函数）：把外部文本解析成"可执行的任务草稿"。
 *
 * 支持两种来源：
 * 1. Markdown 任务清单：`# 项目` 作分组标题，`- [ ] 标题` / `- [x] 标题` 作任务，
 *    缩进的非复选框行并入上一条任务的笔记；
 * 2. Todoist CSV 导出：按表头取 CONTENT / DESCRIPTION / PRIORITY / DUE DATE /
 *    LABELS / PROJECT 列，只导入 TYPE=task 的行。
 *
 * 设计：
 * - 复用 `parseQuickAdd`：标题里的 `@情境` `+标签` `!!!` `明天` 等语法照常生效，
 *   用户在外部文件里写的标记不会被丢掉；
 * - 不落库、不生成 id：只输出草稿计划，由调用方逐条走 `task.create` 等命令；
 * - 单条坏行跳过并计入 warnings，不因一行脏数据让整次导入失败；
 * - 数量上限 5000 条，防止误选大文件把内存打爆。
 */

export interface ImportTaskDraft {
  title: string;
  notes: string;
  /** 已完成的任务在导入后直接 complete（保留完成记录） */
  completed: boolean;
  status: TaskStatusInput;
  priority: 0 | 1 | 2 | 3;
  dueAt: number | null;
  /** 项目名（导入时 find-or-create，映射为 projectId） */
  projectName: string | null;
  contextNames: string[];
  tags: string[];
}

export interface ImportPlan {
  format: ImportFormat;
  tasks: ImportTaskDraft[];
  /** 需要先行创建/复用的项目名（去重，保持首次出现顺序） */
  projects: string[];
  /** 跳过的行数（空行不计） */
  skipped: number;
  warnings: string[];
}

export type ImportFormat = "markdown" | "todoist" | "ticktick" | "generic" | "onlinelist";

/** 通用 CSV 列映射：逻辑字段 → 表头名（大小写不敏感） */
export interface CsvColumnMapping {
  title: string;
  notes?: string;
  priority?: string;
  due?: string;
  tags?: string;
  project?: string;
  status?: string;
}

export const IMPORT_TASK_LIMIT = 5000;

/** 按内容特征猜格式：Todoist → TickTick → Markdown → 其它 CSV → unknown */
export function detectImportFormat(text: string): ImportFormat | "unknown" {
  const head = text.slice(0, 2000).toLowerCase();
  const firstLine = head.split(/\r?\n/, 1)[0] ?? "";
  const isCsv = firstLine.includes(",");
  if (isCsv && /(^|\n)\s*"?type"?\s*,/.test(head) && head.includes("content")) {
    return "todoist";
  }
  // TickTick 导出：TITLE + LIST/FOLDER 表头（Todoist 用 CONTENT，不会误判）
  if (isCsv && /(^|,)\s*"?(title|标题)"?\s*(,|$)/.test(firstLine) && /list|清单|folder|文件夹/.test(firstLine)) {
    return "ticktick";
  }
  if (isCsv && /(^|,)\s*"?(title|标题)"?\s*(,|$)/.test(firstLine)) {
    return "generic";
  }
  if (/(^|\n)\s*[-*+]\s*\[[ xX]\]\s+/.test(text)) return "markdown";
  if (/(^|\n)#{1,6}\s+\S/.test(text)) return "markdown";
  return "unknown";
}

function trimTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function emptyDraft(title: string): ImportTaskDraft {
  return {
    title,
    notes: "",
    completed: false,
    status: "inbox",
    priority: 0,
    dueAt: null,
    projectName: null,
    contextNames: [],
    tags: [],
  };
}

/**
 * 把一行"标题 + 可选已完成标记"解析成草稿：
 * 快速添加语法（@情境 / +标签 / !!! / 明天）全部生效。
 */
function draftFromLine(rawTitle: string, now: number, completed: boolean): ImportTaskDraft | null {
  const parsed = parseQuickAdd(rawTitle, now);
  const title = trimTitle(parsed.title);
  if (title.length === 0) return null;
  const draft = emptyDraft(title);
  draft.completed = completed;
  draft.status = parsed.suggestsWaiting ? "waiting" : "inbox";
  draft.priority = parsed.priority ?? 0;
  draft.dueAt = parsed.dueAt ?? null;
  draft.contextNames = parsed.contextNames;
  draft.tags = parsed.tags;
  draft.projectName = parsed.projectName ?? null;
  return draft;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const CHECKBOX_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const PLAIN_LIST_RE = /^(\s*)[-*+]\s+(?!\[[ xX]\])(.*)$/;

/** Markdown：`# 分组标题` + `- [ ] 任务`；缩进的普通列表行并入上一条任务笔记 */
export function parseMarkdownTasks(text: string, now: number): ImportPlan {
  const plan: ImportPlan = { format: "markdown", tasks: [], projects: [], skipped: 0, warnings: [] };
  let currentProject: string | null = null;
  let lastTask: ImportTaskDraft | null = null;
  let lastIndent = 0;
  const lines = text.split(/\r?\n/);

  const rememberProject = (name: string): void => {
    if (!plan.projects.includes(name)) plan.projects.push(name);
  };

  for (const line of lines) {
    if (line.trim().length === 0) continue;

    const heading = HEADING_RE.exec(line);
    if (heading !== null) {
      const name = trimTitle(heading[2] ?? "");
      currentProject = name.length > 0 ? name : null;
      if (currentProject !== null) rememberProject(currentProject);
      lastTask = null;
      continue;
    }

    const checkbox = CHECKBOX_RE.exec(line);
    if (checkbox !== null) {
      if (plan.tasks.length >= IMPORT_TASK_LIMIT) {
        plan.skipped += 1;
        continue;
      }
      const draft = draftFromLine(checkbox[3] ?? "", now, (checkbox[2] ?? " ").toLowerCase() === "x");
      if (draft === null) {
        plan.skipped += 1;
        continue;
      }
      if (draft.projectName === null) draft.projectName = currentProject;
      else rememberProject(draft.projectName);
      lastIndent = (checkbox[1] ?? "").length;
      plan.tasks.push(draft);
      lastTask = draft;
      continue;
    }

    // 缩进更深的普通列表行 → 上一条任务的笔记（支持多行步骤）
    const plain = PLAIN_LIST_RE.exec(line);
    if (plain !== null && lastTask !== null && (plain[1] ?? "").length > lastIndent) {
      const noteLine = trimTitle(plain[2] ?? "");
      if (noteLine.length > 0) {
        lastTask.notes = lastTask.notes.length > 0 ? `${lastTask.notes}\n- ${noteLine}` : `- ${noteLine}`;
      }
      continue;
    }

    // 其它文本当作上一条任务的补充说明（例如换行的描述）
    if (lastTask !== null) {
      const extra = trimTitle(line);
      if (extra.length > 0) {
        lastTask.notes = lastTask.notes.length > 0 ? `${lastTask.notes}\n${extra}` : extra;
      }
      continue;
    }
    plan.skipped += 1;
  }

  return plan;
}

/* ---------------- Todoist CSV ---------------- */

/** 最小但正确的 CSV 解析：双引号包裹、`""` 转义、CRLF、字段内换行 */
export function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      touched = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      touched = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      touched = true;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      touched = false;
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
    touched = true;
  }
  if (touched || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

const TODOIST_PRIORITY: Record<string, 0 | 1 | 2 | 3> = { "1": 3, "2": 2, "3": 1, "4": 0 };

function findColumn(header: string[], aliases: readonly string[]): number {
  const normalized = header.map((cell) => cell.replace(/^\uFEFF/, "").trim().toLowerCase());
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

/** 解析 ISO 风格的到期日：`2026-11-05` / `2026-11-05 18:00` / `2026-11-05T18:00:00` */
export function parseImportDate(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 18 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null; // 2 月 30 日之类
  }
  return date.getTime();
}

/** Todoist CSV：只导入 TYPE=task 的行；优先级 P1..P4 → 3..0 */
export function parseTodoistCSV(text: string, now: number): ImportPlan {
  const plan: ImportPlan = { format: "todoist", tasks: [], projects: [], skipped: 0, warnings: [] };
  const rows = parseCSVRows(text);
  if (rows.length === 0) {
    plan.warnings.push("CSV 为空");
    return plan;
  }

  const header = rows[0] ?? [];
  const colType = findColumn(header, ["type"]);
  const colContent = findColumn(header, ["content", "task", "title"]);
  const colNotes = findColumn(header, ["description", "notes"]);
  const colPriority = findColumn(header, ["priority"]);
  const colDue = findColumn(header, ["due date", "due"]);
  const colLabels = findColumn(header, ["labels", "label"]);
  const colProject = findColumn(header, ["project", "project name"]);

  if (colContent < 0) {
    plan.warnings.push("缺少 CONTENT 列，无法导入");
    return plan;
  }

  for (const cells of rows.slice(1)) {
    if (plan.tasks.length >= IMPORT_TASK_LIMIT) {
      plan.skipped += 1;
      continue;
    }
    const type = colType >= 0 ? (cells[colType] ?? "").trim().toLowerCase() : "task";
    if (type.length > 0 && type !== "task") {
      plan.skipped += 1;
      continue;
    }

    const draft = draftFromLine(cells[colContent] ?? "", now, false);
    if (draft === null) {
      plan.skipped += 1;
      continue;
    }

    if (colNotes >= 0) {
      const notes = (cells[colNotes] ?? "").trim();
      draft.notes = notes;
    }
    if (colPriority >= 0) {
      const raw = (cells[colPriority] ?? "").trim();
      const mapped = TODOIST_PRIORITY[raw];
      if (mapped !== undefined) draft.priority = mapped;
      else if (/^[0-3]$/.test(raw)) draft.priority = Number(raw) as 0 | 1 | 2 | 3;
    }
    if (colDue >= 0 && draft.dueAt === null) {
      const parsed = parseImportDate(cells[colDue] ?? "");
      if (parsed !== null) draft.dueAt = parsed;
    }
    if (colLabels >= 0) {
      const labels = (cells[colLabels] ?? "")
        .split(/[,;]/)
        .map((label) => label.trim())
        .filter((label) => label.length > 0);
      for (const label of labels) {
        if (!draft.tags.some((tag) => tag.toLowerCase() === label.toLowerCase())) draft.tags.push(label);
      }
    }
    if (colProject >= 0) {
      const project = trimTitle(cells[colProject] ?? "");
      if (project.length > 0) {
        draft.projectName = project;
        if (!plan.projects.includes(project)) plan.projects.push(project);
      }
    }
    plan.tasks.push(draft);
  }

  return plan;
}

/**
 * 优先级归一化：兼容 TickTick（0–3 / 高·中·低·无）、Todoist（P1–P4）、
 * 以及英文 High/Medium/Low/None。
 */
export function normalizeImportPriority(raw: string): 0 | 1 | 2 | 3 | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return null;
  if (/^(none|无|0)$/.test(value)) return 0;
  if (/^(low|低|1)$/.test(value)) return 1;
  if (/^(medium|normal|中|2)$/.test(value)) return 2;
  if (/^(high|urgent|高|3)$/.test(value)) return 3;
  if (/^p([1-4])$/.test(value)) {
    const level = Number(value[1]);
    return (4 - level) as 0 | 1 | 2 | 3; // P1 最高 → 3
  }
  return null;
}

/** 完成状态归一化：Completed / 已完成 / done / true / 1 */
export function normalizeImportCompleted(raw: string): boolean {
  return /^(completed|complete|done|true|yes|1|已完成|完成)$/i.test(raw.trim());
}

function splitLabels(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

function applyDraftFields(
  draft: ImportTaskDraft,
  fields: {
    notes?: string;
    priority?: string;
    due?: string;
    tags?: string;
    project?: string;
    completed?: boolean;
  },
): void {
  if (fields.notes !== undefined) draft.notes = fields.notes.trim();
  if (fields.priority !== undefined && fields.priority.trim().length > 0) {
    const mapped = normalizeImportPriority(fields.priority);
    if (mapped !== null) draft.priority = mapped;
  }
  if (fields.due !== undefined && draft.dueAt === null) {
    const parsed = parseImportDate(fields.due);
    if (parsed !== null) draft.dueAt = parsed;
  }
  if (fields.tags !== undefined) {
    for (const label of splitLabels(fields.tags)) {
      if (!draft.tags.some((tag) => tag.toLowerCase() === label.toLowerCase())) draft.tags.push(label);
    }
  }
  if (fields.project !== undefined) {
    const project = trimTitle(fields.project);
    if (project.length > 0) draft.projectName = project;
  }
  if (fields.completed === true) draft.completed = true;
}

/** TickTick CSV：Folder/List 作项目，Title 作任务，Content 作笔记，Status 判完成 */
export function parseTickTickCSV(text: string, now: number): ImportPlan {
  const plan: ImportPlan = { format: "ticktick", tasks: [], projects: [], skipped: 0, warnings: [] };
  const rows = parseCSVRows(text);
  if (rows.length === 0) {
    plan.warnings.push("CSV 为空");
    return plan;
  }
  const header = rows[0] ?? [];
  const colTitle = findColumn(header, ["title", "标题", "任务"]);
  const colNotes = findColumn(header, ["content", "description", "内容", "描述", "notes"]);
  const colPriority = findColumn(header, ["priority", "优先级"]);
  const colDue = findColumn(header, ["due date", "due", "截止日期", "到期日"]);
  const colTags = findColumn(header, ["tags", "标签"]);
  const colList = findColumn(header, ["list", "清单", "project", "项目"]);
  const colFolder = findColumn(header, ["folder", "文件夹"]);
  const colStatus = findColumn(header, ["status", "状态"]);

  if (colTitle < 0) {
    plan.warnings.push("缺少 TITLE 列，无法导入");
    return plan;
  }

  for (const cells of rows.slice(1)) {
    if (plan.tasks.length >= IMPORT_TASK_LIMIT) {
      plan.skipped += 1;
      continue;
    }
    const draft = draftFromLine(cells[colTitle] ?? "", now, false);
    if (draft === null) {
      plan.skipped += 1;
      continue;
    }
    const project =
      colList >= 0 ? (cells[colList] ?? "") : colFolder >= 0 ? (cells[colFolder] ?? "") : "";
    applyDraftFields(draft, {
      notes: colNotes >= 0 ? (cells[colNotes] ?? "") : undefined,
      priority: colPriority >= 0 ? (cells[colPriority] ?? "") : undefined,
      due: colDue >= 0 ? (cells[colDue] ?? "") : undefined,
      tags: colTags >= 0 ? (cells[colTags] ?? "") : undefined,
      project,
      completed: colStatus >= 0 ? normalizeImportCompleted(cells[colStatus] ?? "") : false,
    });
    if (draft.projectName !== null && !plan.projects.includes(draft.projectName)) {
      plan.projects.push(draft.projectName);
    }
    plan.tasks.push(draft);
  }

  return plan;
}

/**
 * 通用 CSV：调用方显式给出列映射（逻辑字段 → 表头名）。
 * 适合"任意工具导出的 CSV"：用户把列名对上即可导入。
 */
export function parseGenericCSV(text: string, now: number, mapping: CsvColumnMapping): ImportPlan {
  const plan: ImportPlan = { format: "generic", tasks: [], projects: [], skipped: 0, warnings: [] };
  const rows = parseCSVRows(text);
  if (rows.length === 0) {
    plan.warnings.push("CSV 为空");
    return plan;
  }
  const header = rows[0] ?? [];
  const col = (name: string | undefined): number =>
    name === undefined ? -1 : findColumn(header, [name.toLowerCase()]);

  const colTitle = col(mapping.title);
  if (colTitle < 0) {
    plan.warnings.push(`缺少标题列「${mapping.title}」`);
    return plan;
  }
  const colNotes = col(mapping.notes);
  const colPriority = col(mapping.priority);
  const colDue = col(mapping.due);
  const colTags = col(mapping.tags);
  const colProject = col(mapping.project);
  const colStatus = col(mapping.status);

  for (const cells of rows.slice(1)) {
    if (plan.tasks.length >= IMPORT_TASK_LIMIT) {
      plan.skipped += 1;
      continue;
    }
    const draft = draftFromLine(cells[colTitle] ?? "", now, false);
    if (draft === null) {
      plan.skipped += 1;
      continue;
    }
    applyDraftFields(draft, {
      notes: colNotes >= 0 ? (cells[colNotes] ?? "") : undefined,
      priority: colPriority >= 0 ? (cells[colPriority] ?? "") : undefined,
      due: colDue >= 0 ? (cells[colDue] ?? "") : undefined,
      tags: colTags >= 0 ? (cells[colTags] ?? "") : undefined,
      project: colProject >= 0 ? (cells[colProject] ?? "") : undefined,
      completed: colStatus >= 0 ? normalizeImportCompleted(cells[colStatus] ?? "") : false,
    });
    if (draft.projectName !== null && !plan.projects.includes(draft.projectName)) {
      plan.projects.push(draft.projectName);
    }
    plan.tasks.push(draft);
  }

  return plan;
}

/** 统一入口：自动识别格式并分派 */
export function parseImportText(text: string, now: number): ImportPlan {
  const format = detectImportFormat(text);
  if (format === "todoist") return parseTodoistCSV(text, now);
  if (format === "ticktick") return parseTickTickCSV(text, now);
  if (format === "markdown") return parseMarkdownTasks(text, now);
  if (format === "generic") {
    return {
      format: "generic",
      tasks: [],
      projects: [],
      skipped: 0,
      warnings: ["检测到 CSV，但无法确定列含义：请在导入页选择 TickTick 或使用通用映射"],
    };
  }
  return {
    format: "markdown",
    tasks: [],
    projects: [],
    skipped: 0,
    warnings: ["无法识别的格式：请粘贴 Markdown 复选框清单、Todoist 或 TickTick CSV"],
  };
}

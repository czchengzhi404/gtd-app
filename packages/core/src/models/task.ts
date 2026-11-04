import type { BaseRecord } from "./base";

export const TASK_STATUSES = ["inbox", "next", "waiting", "someday", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** GTD 理清后的去向：可行动→next；多步→挂到项目；他人→waiting；暂不处理→someday */
export type TaskStatusInput = Exclude<TaskStatus, "done">;

export interface RecurrenceRule {
  /**
   * - daily / weekly / monthly / yearly：按日历推进
   * - weekdays：仅工作日（周一至周五）
   * - afterCompletion：完成后第 N 天（不依赖原到期日）
   */
  freq: "daily" | "weekly" | "monthly" | "yearly" | "weekdays" | "afterCompletion";
  /** 间隔：2 = 每两周/每两月/每隔两天 */
  interval: number;
  /** 0=周日 … 6=周六，仅 freq=weekly 时有意义 */
  byWeekday?: number[];
  /** monthly 专用：取当月最后一个工作日（周一至周五），优先于日序 */
  lastWeekday?: boolean;
  /** 剩余次数：null 表示无限；完成时递减，归零后任务结束 */
  remainingCount?: number | null;
  /** 不再重复的截止时间（毫秒），null 表示无限重复 */
  until?: number | null;
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  /** 手动排序键（字典序即显示序） */
  orderKey: string;
}

export interface Task extends BaseRecord {
  title: string;
  /** Markdown 笔记 */
  notes: string;
  status: TaskStatus;
  /** 0=无 1=低 2=中 3=高 */
  priority: 0 | 1 | 2 | 3;
  /** 开始日期（defer）：早于此刻的任务不出现在任何"可执行"视图里 */
  deferUntil: number | null;
  dueAt: number | null;
  completedAt: number | null;
  /** 重复任务最近一次完成时间；完成时推进 dueAt 后保留 */
  lastCompletedAt: number | null;
  projectId: string | null;
  sectionId: string | null;
  contextIds: string[];
  /** 标签：多维检索（#紧急 #等审批 #5分钟），与情境（在哪做）互补 */
  tags: string[];
  waitingFor: string | null;
  /** 专注视图已选中的下一步行动 */
  starred: boolean;
  recurrence: RecurrenceRule | null;
  checklist: ChecklistItem[];
  orderKey: string;
}

export const PROJECT_KINDS = ["sequential", "parallel"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_STATUSES = ["active", "onHold", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** 区域：项目的上层归类（工作 / 生活 / 学习） */
export interface Area extends BaseRecord {
  name: string;
  color: string | null;
  orderKey: string;
}

export interface Project extends BaseRecord {
  name: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  color: string | null;
  /** 所属区域；null 表示未归类 */
  areaId: string | null;
  /** 回顾周期（天）：距上次回顾超过该天数即视为待回顾 */
  reviewIntervalDays: number;
  /** 上次回顾时间；null 表示从未回顾 */
  lastReviewedAt: number | null;
}

export interface Section extends BaseRecord {
  projectId: string;
  name: string;
  orderKey: string;
}

export interface Context extends BaseRecord {
  /** 形如 "电脑"（显示时补 @ 前缀） */
  name: string;
  color: string | null;
  icon: string | null;
}

export interface AttachmentMeta extends BaseRecord {
  taskId: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** 文件系统中的相对存储路径（二进制本体不入库） */
  storagePath: string;
}

/**
 * 任务模板：一套可复用的任务骨架。
 *
 * 只保存"新建任务时需要预填的字段"——状态/日期/完成痕迹等由实例化时决定
 * （status 默认 inbox，deferUntil/dueAt 留空，由用户按当下情境填写）。
 * checklist 的子项 id 在实例化时必须重新生成，避免多条任务共享子项 id。
 */
export interface TaskTemplate extends BaseRecord {
  /** 模板名（1..200），同名未删除模板视为同一条 */
  name: string;
  /** 任务标题模板（1..2000） */
  title: string;
  /** Markdown 笔记 */
  notes: string;
  priority: 0 | 1 | 2 | 3;
  projectId: string | null;
  contextIds: string[];
  tags: string[];
  checklist: ChecklistItem[];
  recurrence: RecurrenceRule | null;
}

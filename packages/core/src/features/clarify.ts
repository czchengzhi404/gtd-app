import type { Task } from "../models/task";
import type { AppState } from "../store/app-store";
import { isDeferred, startOfDayOf } from "../store/selectors/time";

/**
 * GTD「理清」（Clarify）决策树的纯函数实现。
 *
 * 设计原则：
 * - 所有规则都可解释：每个推荐都带 reasonCode，UI 可直接展示"为什么"；
 * - 不猜测用户意图，只使用任务自身可观察的信号（2 分钟标签/文案、
 *   清单步骤数、waitingFor、项目、到期日）；
 * - 输入不可变，输出可结构化克隆，无 React / 无时间副作用。
 *
 * 推荐优先级（先命中先返回）：
 *   已删除 → trash；已完成 → done；已处于 waiting/someday/next → 保持原状态；
 *   等待他人 → waiting；2 分钟 → twoMinute；
 *   无项目且多步 → project；无到期且无项目 → someday；
 *   未来 7 天内到期 → defer；逾期或其余可行动 → next。
 */

export const CLARIFY_ACTIONS = [
  "next",
  "waiting",
  "someday",
  "done",
  "trash",
  "twoMinute",
  "delegate",
  "project",
  "defer",
] as const;

export type ClarifyAction = (typeof CLARIFY_ACTIONS)[number];

export interface ClarifyOption {
  key: ClarifyAction;
  labelKey: string;
  hintKey: string;
  recommended: boolean;
}

export interface ClarifyRecommendation {
  action: ClarifyAction;
  reasonCode: string;
}

export interface ClarifyProgress {
  inboxCount: number;
  processedToday: number;
  oldestInboxAgeDays: number;
}

const ACTION_META: Record<ClarifyAction, { labelKey: string; hintKey: string }> = {
  next: { labelKey: "clarify.action.next.label", hintKey: "clarify.action.next.hint" },
  waiting: { labelKey: "clarify.action.waiting.label", hintKey: "clarify.action.waiting.hint" },
  someday: { labelKey: "clarify.action.someday.label", hintKey: "clarify.action.someday.hint" },
  done: { labelKey: "clarify.action.done.label", hintKey: "clarify.action.done.hint" },
  trash: { labelKey: "clarify.action.trash.label", hintKey: "clarify.action.trash.hint" },
  twoMinute: {
    labelKey: "clarify.action.twoMinute.label",
    hintKey: "clarify.action.twoMinute.hint",
  },
  delegate: {
    labelKey: "clarify.action.delegate.label",
    hintKey: "clarify.action.delegate.hint",
  },
  project: { labelKey: "clarify.action.project.label", hintKey: "clarify.action.project.hint" },
  defer: { labelKey: "clarify.action.defer.label", hintKey: "clarify.action.defer.hint" },
};

const DAY = 86_400_000;

const TWO_MINUTE_TAG = /^(?:2\s*(?:分钟|min|m)|两分钟|two\s*minutes?)$/i;
const TWO_MINUTE_TEXT = /(?:^|[^0-9])2\s*(?:分钟|min\b)/i;
const STEP_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

/** 2 分钟规则信号：标签精确匹配，或标题/笔记出现 "2 分钟 / 2min"（排除 12 分钟等） */
export function isTwoMinuteTask(task: Task): boolean {
  if (task.tags.some((tag) => TWO_MINUTE_TAG.test(tag.trim()))) return true;
  return TWO_MINUTE_TEXT.test(task.title) || TWO_MINUTE_TEXT.test(task.notes);
}

/**
 * 多步任务信号：清单至少 2 项，或笔记里至少 2 条 Markdown 列表/编号步骤。
 * 单条清单项不算多步（可能只是一个执行动作）。
 */
export function isMultiStepTask(task: Task): boolean {
  if (task.checklist.length >= 2) return true;
  const stepLines = task.notes
    .split(/\r?\n/)
    .filter((line) => STEP_LINE.test(line));
  return stepLines.length >= 2;
}

export function recommendedClarify(task: Task, now: number): ClarifyRecommendation {
  if (task.deletedAt !== null) {
    return { action: "trash", reasonCode: "clarify.reason.deleted" };
  }
  if (task.status === "done") {
    return { action: "done", reasonCode: "clarify.reason.done" };
  }
  if (task.status === "waiting") {
    return { action: "waiting", reasonCode: "clarify.reason.statusWaiting" };
  }
  if (task.status === "someday") {
    return { action: "someday", reasonCode: "clarify.reason.statusSomeday" };
  }
  if (task.status === "next") {
    return { action: "next", reasonCode: "clarify.reason.statusNext" };
  }
  if (task.waitingFor !== null && task.waitingFor.trim().length > 0) {
    return { action: "waiting", reasonCode: "clarify.reason.waiting" };
  }
  if (isTwoMinuteTask(task)) {
    return { action: "twoMinute", reasonCode: "clarify.reason.twoMinute" };
  }
  if (task.projectId === null && isMultiStepTask(task)) {
    return { action: "project", reasonCode: "clarify.reason.multiStep" };
  }
  if (task.dueAt === null && task.projectId === null) {
    return { action: "someday", reasonCode: "clarify.reason.noDueNoProject" };
  }
  if (task.dueAt !== null) {
    const delta = task.dueAt - now;
    if (delta > 0 && delta <= 7 * DAY) {
      return { action: "defer", reasonCode: "clarify.reason.dueWithin7Days" };
    }
    if (delta <= 0) {
      return { action: "next", reasonCode: "clarify.reason.overdue" };
    }
  }
  return { action: "next", reasonCode: "clarify.reason.actionable" };
}

/**
 * 返回完整动作集（固定顺序，UI 不需要自己维护枚举）。
 * `recommended` 标记与 recommendedClarify 完全一致；now 可注入以便测试。
 */
export function clarifyOptions(task: Task, now: number = Date.now()): ClarifyOption[] {
  const recommendation = recommendedClarify(task, now);
  return CLARIFY_ACTIONS.map((key) => ({
    key,
    labelKey: ACTION_META[key].labelKey,
    hintKey: ACTION_META[key].hintKey,
    recommended: key === recommendation.action,
  }));
}

/**
 * 收集箱理清进度。
 * - inboxCount：未删除、status=inbox 且未到 defer 时间的任务数（与收集箱视图一致）；
 * - processedToday：今天有更新且已离开 inbox 的任务数（无事件日志，以 updatedAt 近似）；
 * - oldestInboxAgeDays：最老可见 inbox 任务（未 defer）距今天数（向下取整，无任务为 0）。
 */
export function clarifyProgress(state: AppState, now: number = Date.now()): ClarifyProgress {
  const dayStart = startOfDayOf(now);
  let inboxCount = 0;
  let processedToday = 0;
  let oldestInboxCreatedAt: number | null = null;

  for (const task of Object.values(state.tasks)) {
    if (task.deletedAt !== null) continue;

    if (task.status === "inbox") {
      if (!isDeferred(task, now)) {
        inboxCount += 1;
        if (oldestInboxCreatedAt === null || task.createdAt < oldestInboxCreatedAt) {
          oldestInboxCreatedAt = task.createdAt;
        }
      }
    }

    if (task.status !== "inbox" && task.updatedAt >= dayStart && task.updatedAt <= now) {
      processedToday += 1;
    }
  }

  return {
    inboxCount,
    processedToday,
    oldestInboxAgeDays:
      oldestInboxCreatedAt === null
        ? 0
        : Math.max(0, Math.floor((now - oldestInboxCreatedAt) / DAY)),
  };
}

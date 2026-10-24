import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

/**
 * 轻量 i18n：中英双词典 + 语言状态（vanilla store，React 绑定在 useT/useLang）。
 * 语言持久化在 kv（key "lang"，不参与同步，各设备独立）；桌面菜单/托盘由
 * 主进程监听 settings.set lang 命令重建。
 */

export type Lang = "zh" | "en";

type Dict = Record<string, string>;

const zh: Dict = {
  // 导航
  "nav.inbox": "收集箱",
  "nav.today": "今天",
  "nav.focus": "专注",
  "nav.projects": "项目",
  "nav.more": "更多",
  // 通用
  "common.add": "添加",
  "common.cancel": "取消",
  "common.delete": "删除",
  "common.save": "保存",
  "common.brand": "GTD 清单",
  // 收集箱
  "inbox.quickAddPlaceholder": "随手记… 支持 @情境 #项目 !!! 明天 每天",
  "inbox.a11yQuickAdd": "快速添加任务",
  "inbox.a11yQuickAddHint": "支持 @情境 #项目 !!!优先级 明天/周五/N天后 每天 等语法",
  "inbox.a11ySubmit": "添加任务",
  "inbox.submitting": "…",
  "inbox.emptyTitle": "收集箱是空的",
  "inbox.emptyHint": "随手记点什么吧，之后再来理清",
  "inbox.previewArrow": "→",
  "recurrence.daily": "每天",
  "recurrence.weekly": "每周",
  "recurrence.monthly": "每月",
  "recurrence.yearly": "每年",
  // 视图
  "view.list": "列表",
  "view.kanban": "看板",
  "view.calendar": "日历",
  "view.timeline": "Timeline",
  "view.inboxLabel": "收集箱视图",
  "view.todayLabel": "今天视图",
  // 今天
  "today.section": "今日与逾期",
  "today.emptyTitle": "今天没有安排",
  "today.emptyHint": "给任务加上到期时间，它会出现在这里",
  // 专注
  "focus.starredSection": "已选中的下一步行动",
  "focus.todaySection": "今日到期",
  "focus.emptyStarred": "还没有选中的行动",
  "focus.emptyStarredHint": "在任务详情里点「☆ 选入专注」",
  "focus.emptyToday": "今日无到期任务",
  // 项目
  "projects.emptyTitle": "还没有项目",
  "projects.emptyHint": "多步任务可以组织成项目",
  "projects.create": "＋ 新建项目",
  "projects.creating": "创建中…",
  "projects.next": "下一步：",
  "projects.noneNext": "暂无下一步行动",
  "projects.openCount": "{n} 个未完成",
  "projects.sequential": "顺序",
  "projects.parallel": "并行",
  "projects.a11yOpen": "打开项目：{name}，{n} 个未完成任务",
  // 任务行
  "task.a11yCompleted": "已完成：{title}",
  "task.a11yMarkComplete": "标记完成：{title}",
  "task.a11yOpen": "打开任务：{title}",
  "task.dueA11y": "到期 {label}，已逾期",
  "task.dueA11yOk": "到期 {label}",
  "task.priorityA11y": "优先级 {n}",
  // 详情
  "detail.title": "任务详情",
  "detail.clarify": "理清（移动到）",
  "detail.status.inbox": "收集箱",
  "detail.status.next": "下一步",
  "detail.status.waiting": "等待中",
  "detail.status.someday": "将来/也许",
  "detail.priority": "优先级",
  "detail.priority.none": "无",
  "detail.actions": "操作",
  "detail.star": "☆ 选入专注",
  "detail.starred": "★ 已选入专注",
  "detail.delete": "删除",
  "detail.notes": "笔记（Markdown）",
  "detail.deleteConfirm": "删除任务",
  "detail.deleteConfirmBody": "确定删除「{title}」吗？",
  // 空态
  "empty.list": "没有任务",
  "empty.listHint": "用顶部输入框快速添加",
  // 日历
  "calendar.month": "{y} 年 {m} 月",
  "calendar.prevMonth": "上个月",
  "calendar.nextMonth": "下个月",
  "calendar.dayA11y": "{m} 月 {d} 日，{n} 个到期任务",
  "calendar.emptyDay": "当日无到期任务",
  "calendar.wrongMonth": "所选日期不在当前月份",
  "calendar.weekdays": "一,二,三,四,五,六,日",
  // 更多
  "more.waiting": "等待中",
  "more.someday": "将来 / 也许",
  "more.waitingEmpty": "没有等待他人的事项",
  "more.somedayEmpty": "暂无搁置的想法",
  "more.waitingFor": "等 {who}",
  "more.language": "语言",
  "more.lang.zh": "中文",
  "more.lang.en": "English",
  "more.reviewSection": "每周回顾",
  "more.reviewLast": "上次回顾",
  "more.reviewNever": "从未回顾",
  "more.reviewStart": "开始每周回顾",
  "more.syncSection": "同步（可选）",
  "more.kind.webdav": "WebDAV",
  "more.kind.http": "自托管",
  "more.kind.folder": "本地文件夹",
  "more.server": "服务端地址",
  "more.username": "用户名",
  "more.password": "密码",
  "more.pickFolder": "选择同步文件夹",
  "more.enabled": "已启用",
  "more.disabled": "已停用",
  "more.saveConfig": "保存配置",
  "more.syncNow": "立即同步",
  "more.lastSync": "上次同步：",
  "more.lastSyncNever": "从未同步",
  "more.dataSection": "数据",
  "more.export": "导出全部数据（JSON）",
  "more.import": "从 JSON 导入（合并）",
  "more.about": "关于",
  "more.status.saved": "同步配置已保存",
  "more.status.syncing": "同步中…",
  "more.status.syncFailed": "同步失败：",
  "more.status.saveFailed": "保存失败：",
  "more.status.exported": "已导出到 ",
  "more.status.canceled": "已取消",
  "more.status.exportFailed": "导出失败：",
  "more.status.importing": "导入中…",
  "more.status.importFailed": "导入失败：",
  // 同步引擎消息
  "sync.notEnabled": "同步未启用：先在下方配置并开启",
  "sync.report": "已应用 {applied} 条 · 推送 {pushed} 条 · 设备 {devices}",
  "sync.readFailed": "无法读取所选文件",
  "sync.merged": "已合并 {n} 条记录",
  // 每周回顾
  "review.title": "每周回顾",
  "review.steps.inbox": "收集箱",
  "review.steps.projects": "项目",
  "review.steps.calendar": "日程",
  "review.steps.waiting": "等待中",
  "review.steps.someday": "将来 / 也许",
  "review.steps.done": "完成",
  "review.inboxBody": "收集箱还有 {n} 条未理清。逐条问自己：可行动吗？下一步是什么？",
  "review.goInbox": "去处理收集箱",
  "review.inboxClean": "收集箱已清空 ✓",
  "review.projectsOk": "所有活跃项目都有下一步行动 ✓",
  "review.projectsBody": "以下项目还没有明确的下一步行动，逐个确认：",
  "review.calendarBody":
    "过去 7 天完成了 {completed} 个任务；未来 14 天有 {upcoming} 个到期。打开日历核对日程与假期安排。",
  "review.waitingBody": "等待中 {n} 项——该催的催，该放弃的放进将来/也许。",
  "review.somedayBody": "将来 / 也许清单现有 {n} 条。每周瞄一眼：有值得启动的吗？有该删除的吗？",
  "review.finishBody": "回顾完成。记录本次时间，下周同一时间再来。",
  "review.finish": "完成回顾",
  "review.prev": "上一步",
  "review.next": "下一步",
  // 关于 / 启动
  "about.title": "GTD 清单",
  "about.body": "本地优先的任务清单应用。版本 {version}。",
  "boot.error": "启动失败",
  "platform.webUnsupported": "纯浏览器模式未接存储：请在桌面应用或移动端运行",
  // 通知
  "notify.dueTitle": "任务到期",
};

const en: Dict = {
  "nav.inbox": "Inbox",
  "nav.today": "Today",
  "nav.focus": "Focus",
  "nav.projects": "Projects",
  "nav.more": "More",
  "common.add": "Add",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.save": "Save",
  "common.brand": "GTD List",
  "inbox.quickAddPlaceholder": "Quick note… try @context #project !!! tomorrow daily",
  "inbox.a11yQuickAdd": "Quick add task",
  "inbox.a11yQuickAddHint": "Supports @context #project !!!priority tomorrow/fri/N days daily",
  "inbox.a11ySubmit": "Add task",
  "inbox.submitting": "…",
  "inbox.emptyTitle": "Inbox is empty",
  "inbox.emptyHint": "Jot anything down — clarify it later",
  "inbox.previewArrow": "→",
  "recurrence.daily": "daily",
  "recurrence.weekly": "weekly",
  "recurrence.monthly": "monthly",
  "recurrence.yearly": "yearly",
  "view.list": "List",
  "view.kanban": "Board",
  "view.calendar": "Calendar",
  "view.timeline": "Timeline",
  "view.inboxLabel": "Inbox view",
  "view.todayLabel": "Today view",
  "today.section": "Today & overdue",
  "today.emptyTitle": "Nothing scheduled today",
  "today.emptyHint": "Add a due date and it will show up here",
  "focus.starredSection": "Starred next actions",
  "focus.todaySection": "Due today",
  "focus.emptyStarred": "No starred actions",
  "focus.emptyStarredHint": "Tap “☆ Star for Focus” in the task details",
  "focus.emptyToday": "Nothing due today",
  "projects.emptyTitle": "No projects yet",
  "projects.emptyHint": "Organize multi-step work into projects",
  "projects.create": "＋ New project",
  "projects.creating": "Creating…",
  "projects.next": "Next: ",
  "projects.noneNext": "No next action yet",
  "projects.openCount": "{n} open",
  "projects.sequential": "Sequential",
  "projects.parallel": "Parallel",
  "projects.a11yOpen": "Open project {name}, {n} open tasks",
  "task.a11yCompleted": "Completed: {title}",
  "task.a11yMarkComplete": "Mark complete: {title}",
  "task.a11yOpen": "Open task: {title}",
  "task.dueA11y": "Due {label}, overdue",
  "task.dueA11yOk": "Due {label}",
  "task.priorityA11y": "Priority {n}",
  "detail.title": "Task detail",
  "detail.clarify": "Clarify (move to)",
  "detail.status.inbox": "Inbox",
  "detail.status.next": "Next",
  "detail.status.waiting": "Waiting",
  "detail.status.someday": "Someday",
  "detail.priority": "Priority",
  "detail.priority.none": "None",
  "detail.actions": "Actions",
  "detail.star": "☆ Star for Focus",
  "detail.starred": "★ Starred for Focus",
  "detail.delete": "Delete",
  "detail.notes": "Notes (Markdown)",
  "detail.deleteConfirm": "Delete task",
  "detail.deleteConfirmBody": "Delete “{title}”?",
  "empty.list": "No tasks",
  "empty.listHint": "Quick-add with the bar above",
  "calendar.month": "{m}/{y}",
  "calendar.prevMonth": "Previous month",
  "calendar.nextMonth": "Next month",
  "calendar.dayA11y": "{m}/{d}, {n} due tasks",
  "calendar.emptyDay": "Nothing due that day",
  "calendar.wrongMonth": "Selected date is not in this month",
  "calendar.weekdays": "Mo,Tu,We,Th,Fr,Sa,Su",
  "more.waiting": "Waiting",
  "more.someday": "Someday",
  "more.waitingEmpty": "Nothing waiting on others",
  "more.somedayEmpty": "No parked ideas",
  "more.waitingFor": "on {who}",
  "more.language": "Language",
  "more.lang.zh": "中文",
  "more.lang.en": "English",
  "more.reviewSection": "Weekly review",
  "more.reviewLast": "Last review",
  "more.reviewNever": "Never",
  "more.reviewStart": "Start weekly review",
  "more.syncSection": "Sync (optional)",
  "more.kind.webdav": "WebDAV",
  "more.kind.http": "Self-hosted",
  "more.kind.folder": "Local folder",
  "more.server": "Server URL",
  "more.username": "Username",
  "more.password": "Password",
  "more.pickFolder": "Choose sync folder",
  "more.enabled": "Enabled",
  "more.disabled": "Disabled",
  "more.saveConfig": "Save config",
  "more.syncNow": "Sync now",
  "more.lastSync": "Last sync: ",
  "more.lastSyncNever": "Never synced",
  "more.dataSection": "Data",
  "more.export": "Export all data (JSON)",
  "more.import": "Import from JSON (merge)",
  "more.about": "About",
  "more.status.saved": "Sync config saved",
  "more.status.syncing": "Syncing…",
  "more.status.syncFailed": "Sync failed: ",
  "more.status.saveFailed": "Save failed: ",
  "more.status.exported": "Exported to ",
  "more.status.canceled": "Canceled",
  "more.status.exportFailed": "Export failed: ",
  "more.status.importing": "Importing…",
  "more.status.importFailed": "Import failed: ",
  "sync.notEnabled": "Sync is not enabled — configure it below first",
  "sync.report": "Applied {applied} · pushed {pushed} · devices {devices}",
  "sync.readFailed": "Cannot read the selected file",
  "sync.merged": "Merged {n} records",
  "review.title": "Weekly review",
  "review.steps.inbox": "Inbox",
  "review.steps.projects": "Projects",
  "review.steps.calendar": "Calendar",
  "review.steps.waiting": "Waiting",
  "review.steps.someday": "Someday",
  "review.steps.done": "Done",
  "review.inboxBody": "You have {n} unprocessed items in your inbox. For each ask: is it actionable? what is the next step?",
  "review.goInbox": "Process inbox",
  "review.inboxClean": "Inbox is clear ✓",
  "review.projectsOk": "Every active project has a next action ✓",
  "review.projectsBody": "These projects lack a clear next action — confirm each:",
  "review.calendarBody": "{completed} tasks completed in the last 7 days; {upcoming} due in the next 14 days. Check the calendar for schedules and holidays.",
  "review.waitingBody": "{n} items waiting — nudge where needed, park what should wait.",
  "review.somedayBody": "Your someday list has {n} items. Glance weekly: anything ready to start? anything to drop?",
  "review.finishBody": "Review complete. This run has been recorded — see you next week.",
  "review.finish": "Finish review",
  "review.prev": "Back",
  "review.next": "Next",
  "about.title": "GTD List",
  "about.body": "Local-first task list. Version {version}.",
  "boot.error": "Startup failed",
  "platform.webUnsupported": "Storage isn't available in a plain browser — run the desktop or mobile app",
  "notify.dueTitle": "Task due",
};

const DICTS: Record<Lang, Dict> = { zh, en };

interface LangState {
  lang: Lang;
}

export const langStore = createStore<LangState>(() => ({ lang: detectLang() }));

/** 首次无设置时的系统语言探测（Intl 可用则用，否则中文） */
export function detectLang(): Lang {
  try {
    if (typeof Intl !== "undefined") {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
      return locale.toLowerCase().startsWith("en") ? "en" : "zh";
    }
  } catch {
    /* Intl 不可用 */
  }
  return "zh";
}

export function getLang(): Lang {
  return langStore.getState().lang;
}

export function setLang(lang: Lang): void {
  langStore.setState({ lang: lang === "en" ? "en" : "zh" });
}

/** 翻译：支持 {name} 参数插值；缺键回退中文，再回退键名 */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = getLang();
  const raw = DICTS[lang][key] ?? DICTS.zh[key] ?? key;
  if (params === undefined) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match,
  );
}

/** React 绑定：语言变化触发重渲染 */
export function useLang(): Lang {
  return useStore(langStore, (s) => s.lang);
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  useStore(langStore, (s) => s.lang);
  return t;
}

/** 副本标签：zh/en 二元组辅助（日历星期等列表型文案） */
export function tList(key: string): string[] {
  return t(key).split(",");
}

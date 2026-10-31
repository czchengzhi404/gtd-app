import { describe, expect, test } from "bun:test";

import { parseQuickAdd } from "../features/quick-add";
import { normalizeTag, normalizeTags } from "../features/tags";
import { nextOccurrence } from "../features/recurrence";
import { applyListFilter } from "../store/selectors";
import type { RecurrenceRule, Task } from "../models/task";

// 锚定一个确定的"今天"：2026-10-31（周六）10:00
const NOW = new Date(2026, 9, 31, 10, 0, 0).getTime();
const DAY = 86400000;

function day(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hourOf(ms: number): number {
  return new Date(ms).getHours();
}

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: "任务",
    notes: "",
    status: "inbox",
    priority: 0,
    deferUntil: null,
    dueAt: null,
    completedAt: null,
    lastCompletedAt: null,
    projectId: null,
    sectionId: null,
    contextIds: [],
    tags: [],
    waitingFor: null,
    starred: false,
    recurrence: null,
    checklist: [],
    orderKey: "0001",
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    deletedAt: null,
    ...partial,
  };
}

/** 5.1 语法表：按 technical-reference.md 逐行断言 */
describe("文档符合性 · 5.1 快速添加语法表", () => {
  test("@情境（可多个）", () => {
    const r = parseQuickAdd("交报表 @电脑 @电话", NOW);
    expect(r.contextNames).toEqual(["电脑", "电话"]);
    expect(r.title).toBe("交报表");
  });

  test("#项目（find-or-create 由 store 层负责）", () => {
    const r = parseQuickAdd("修水管 #装修", NOW);
    expect(r.projectName).toBe("装修");
    expect(r.title).toBe("修水管");
  });

  test("+标签（可多个，归一化）", () => {
    const r = parseQuickAdd("交报表 +紧急 +等审批", NOW);
    expect(r.tags).toEqual(["紧急", "等审批"]);
  });

  test("! / !! / !!! 优先级", () => {
    expect(parseQuickAdd("买 !", NOW).priority).toBe(1);
    expect(parseQuickAdd("买 !!", NOW).priority).toBe(2);
    expect(parseQuickAdd("买 !!!", NOW).priority).toBe(3);
  });

  test(">人名 → waitingFor + 建议 waiting", () => {
    const r = parseQuickAdd("催款 >张三", NOW);
    expect(r.waitingFor).toBe("张三");
    expect(r.suggestsWaiting).toBe(true);
    expect(r.title).toBe("催款");
  });

  test("今天/明天/后天/大后天（默认 18:00）", () => {
    expect(day(parseQuickAdd("买菜 今天", NOW).dueAt ?? 0)).toBe("2026-10-31");
    expect(day(parseQuickAdd("买菜 明天", NOW).dueAt ?? 0)).toBe("2026-11-1");
    expect(day(parseQuickAdd("买菜 后天", NOW).dueAt ?? 0)).toBe("2026-11-2");
    expect(day(parseQuickAdd("买菜 大后天", NOW).dueAt ?? 0)).toBe("2026-11-3");
    const t = parseQuickAdd("买菜 明天", NOW).dueAt ?? 0;
    expect(hourOf(t)).toBe(18); // 无时刻 → 默认 18:00
  });

  test("today/tomorrow（英文）", () => {
    expect(day(parseQuickAdd("buy today", NOW).dueAt ?? 0)).toBe("2026-10-31");
    expect(day(parseQuickAdd("buy tomorrow", NOW).dueAt ?? 0)).toBe("2026-11-1");
  });

  test("周X：本周已过 → 下周", () => {
    // 2026-10-31 是周六：本周二已过 → 下周二
    const r = parseQuickAdd("开会 周二", NOW);
    expect(day(r.dueAt ?? 0)).toBe("2026-11-3");
    // 本周日（明天）未过 → 本周
    expect(day(parseQuickAdd("开会 周日", NOW).dueAt ?? 0)).toBe("2026-11-1");
  });

  test("下周X", () => {
    expect(day(parseQuickAdd("开会 下周三", NOW).dueAt ?? 0)).toBe("2026-11-4");
  });

  test("N天后 / in N days", () => {
    expect(day(parseQuickAdd("回访 3天后", NOW).dueAt ?? 0)).toBe("2026-11-3");
    expect(day(parseQuickAdd("follow up in 5 days", NOW).dueAt ?? 0)).toBe("2026-11-5");
  });

  test("M月D日 / MM-DD / YYYY-MM-DD（今年已过 → 明年）", () => {
    expect(day(parseQuickAdd("体检 10月1日", NOW).dueAt ?? 0)).toBe("2027-10-1");
    expect(day(parseQuickAdd("体检 12-25", NOW).dueAt ?? 0)).toBe("2026-12-25");
    expect(day(parseQuickAdd("体检 2026-12-25", NOW).dueAt ?? 0)).toBe("2026-12-25");
  });

  test("时刻修饰：上午/下午/晚上/HH:mm/am-pm", () => {
    expect(hourOf(parseQuickAdd("站会 上午9点", NOW).dueAt ?? 0)).toBe(9);
    const pm = parseQuickAdd("复查 下午3点30", NOW).dueAt ?? 0;
    expect(hourOf(pm)).toBe(15);
    expect(new Date(pm).getMinutes()).toBe(30);
    expect(hourOf(parseQuickAdd("夜跑 晚上8点", NOW).dueAt ?? 0)).toBe(20);
    expect(hourOf(parseQuickAdd("汇报 15:30", NOW).dueAt ?? 0)).toBe(15);
    expect(hourOf(parseQuickAdd("standup 9am", NOW).dueAt ?? 0)).toBe(9);
  });

  test("每天/每日/daily", () => {
    for (const syntax of ["每天", "每日", "daily"]) {
      const r = parseQuickAdd(`打卡 ${syntax}`, NOW);
      expect(r.recurrence?.freq).toBe("daily");
      expect(r.recurrence?.interval).toBe(1);
    }
  });

  test("每周X / 每周（多天）", () => {
    const r = parseQuickAdd("上课 每周二", NOW);
    expect(r.recurrence?.freq).toBe("weekly");
    expect(r.recurrence?.byWeekday).toEqual([2]);
  });

  test("每周一三（紧凑写法）应得到 [1,3]", () => {
    const r = parseQuickAdd("上课 每周一三", NOW);
    expect(r.recurrence?.freq).toBe("weekly");
    expect(r.recurrence?.byWeekday).toEqual([1, 3]);
  });

  test("每月N日", () => {
    const r = parseQuickAdd("交房租 每月1日", NOW);
    expect(r.recurrence?.freq).toBe("monthly");
    expect(day(r.dueAt ?? 0)).toBe("2026-11-1"); // 本月 1 日已过 → 下月
  });

  test("每年M月D日", () => {
    const r = parseQuickAdd("生日蛋糕 每年6月1日", NOW);
    expect(r.recurrence?.freq).toBe("yearly");
    expect(day(r.dueAt ?? 0)).toBe("2027-6-1");
  });

  test("双周", () => {
    const r = parseQuickAdd("例会 双周", NOW);
    expect(r.recurrence).toEqual({ freq: "weekly", interval: 2, until: null });
  });

  test("每月最后工作日", () => {
    const r = parseQuickAdd("结算 每月最后工作日", NOW);
    expect(r.recurrence?.freq).toBe("monthly");
    expect(r.recurrence?.lastWeekday).toBe(true);
  });

  test("每隔N天（最小 2）", () => {
    const r = parseQuickAdd("浇花 每隔3天", NOW);
    expect(r.recurrence?.freq).toBe("daily");
    expect(r.recurrence?.interval).toBe(3);
  });

  test("每工作日", () => {
    const r = parseQuickAdd("站会 每工作日", NOW);
    expect(r.recurrence?.freq).toBe("weekdays");
  });

  test("完成后N天", () => {
    const r = parseQuickAdd("复诊 完成后30天", NOW);
    expect(r.recurrence?.freq).toBe("afterCompletion");
    expect(r.recurrence?.interval).toBe(30);
  });

  test("重复N次（与 每天 叠加也应生效）", () => {
    const r = parseQuickAdd("打卡 每天 重复5次", NOW);
    expect(r.recurrence?.freq).toBe("daily");
    expect(r.recurrence?.remainingCount).toBe(5);
  });

  test("标题残余干净（无语法残留）", () => {
    expect(parseQuickAdd("交报表 @电脑 #工作 +紧急 !!! 明天 15:30 >张三", NOW).title).toBe("交报表");
  });
});

/** 4.3 重复规则语义 */
describe("文档符合性 · 4.3 重复规则", () => {
  const DAY_START = new Date(2026, 9, 31, 18, 0, 0).getTime(); // 周六 18:00

  test("weekdays 跳过周六周日", () => {
    const rule: RecurrenceRule = { freq: "weekdays", interval: 1, until: null };
    const next = nextOccurrence(DAY_START, rule, NOW);
    // 周六 18:00 完成 → 下一个工作日是周一 11-2
    expect(day(next ?? 0)).toBe("2026-11-2");
  });

  test("monthly lastWeekday 取当月最后一个工作日", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 1, lastWeekday: true, until: null };
    const next = nextOccurrence(DAY_START, rule, NOW);
    // 10/31（周六）完成 → 11 月最后一个工作日 11/30（周一）
    expect(day(next ?? 0)).toBe("2026-11-30");
  });

  test("afterCompletion 以完成时刻为基准（次日 + 间隔-1 天）", () => {
    const rule: RecurrenceRule = { freq: "afterCompletion", interval: 3, until: null };
    const next = nextOccurrence(DAY_START, rule, NOW);
    // 完成于 10-31 → 从明天 11-1 起算 3 天窗口 → 11-3，保留完成时刻的钟点
    expect(day(next ?? 0)).toBe("2026-11-3");
    expect(hourOf(next ?? 0)).toBe(18);
  });

  test("remainingCount 归零结束发生在 task.complete 层（生成本身不受限）", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, remainingCount: 1, until: null };
    // nextOccurrence 只负责生成下一条；次数耗尽的终止由 complete 依据 remainingCount 判定
    expect(nextOccurrence(DAY_START, rule, NOW)).not.toBe(null);
  });

  test("until 截止：超过即 null", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, until: NOW + DAY };
    const next = nextOccurrence(DAY_START, rule, NOW);
    // 下一 occurrence（11-1 18:00）> until（11-1 10:00）→ null
    expect(next).toBe(null);
  });
});

/** 5.6 筛选：搜索匹配 标题/笔记/标签 */
describe("文档符合性 · 5.6 筛选", () => {
  test("query 命中标题/笔记/标签", () => {
    const tasks = [
      task({ id: "t1", title: "买牛奶" }),
      task({ id: "t2", title: "其他", notes: "备注里提到物业费" }),
      task({ id: "t3", title: "第三条", tags: ["财务"] }),
    ];
    expect(applyListFilter(tasks, { query: "牛奶" }, NOW).map((t) => t.id)).toEqual(["t1"]);
    expect(applyListFilter(tasks, { query: "物业费" }, NOW).map((t) => t.id)).toEqual(["t2"]);
    expect(applyListFilter(tasks, { query: "财务" }, NOW).map((t) => t.id)).toEqual(["t3"]);
  });

  test("overdueOnly 排除今天到期与已完成", () => {
    const tasks = [
      task({ id: "a", dueAt: NOW - DAY }),
      task({ id: "b", dueAt: NOW + 3600_000 }),
      task({ id: "c", dueAt: NOW - DAY, status: "done" }),
    ];
    expect(applyListFilter(tasks, { overdueOnly: true }, NOW).map((t) => t.id)).toEqual(["a"]);
  });
});

/** 5.1 标签归一化规则 */
describe("文档符合性 · 标签归一化", () => {
  test("去 #、压空白为 -、去保留字符、限 24", () => {
    expect(normalizeTag("#紧急")).toBe("紧急");
    expect(normalizeTag("工作 相关")).toBe("工作-相关");
    expect(normalizeTag("a@b+c>d!e")).toBe("a-b-c-d-e");
    expect(normalizeTag("x".repeat(30)).length).toBe(24);
  });

  test("批量不区分大小写去重", () => {
    expect(normalizeTags(["A", "a", "B"])).toEqual(["A", "B"]);
  });
});

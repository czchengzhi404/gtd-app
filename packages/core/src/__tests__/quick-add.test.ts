import { describe, it, expect } from "bun:test";
import { parseQuickAdd } from "../features/quick-add";
import { nextOccurrence, startOfDay } from "../features/recurrence";

// 固定"现在"：2026-10-24（周六）10:00 本地时间
const NOW = new Date(2026, 9, 24, 10, 0, 0, 0).getTime();

describe("quick-add 解析", () => {
  it("纯标题", () => {
    const r = parseQuickAdd("买牛奶", NOW);
    expect(r.title).toBe("买牛奶");
    expect(r.dueAt).toBeUndefined();
    expect(r.contextNames).toEqual([]);
  });

  it("@情境 #项目 提取", () => {
    const r = parseQuickAdd("打电话给张三 @电话 #装修", NOW);
    expect(r.title).toBe("打电话给张三");
    expect(r.contextNames).toEqual(["电话"]);
    expect(r.projectName).toBe("装修");
  });

  it("优先级 !/!!/!!!", () => {
    expect(parseQuickAdd("任务 !!!", NOW).priority).toBe(3);
    expect(parseQuickAdd("任务 !!", NOW).priority).toBe(2);
    expect(parseQuickAdd("任务 !", NOW).priority).toBe(1);
    expect(parseQuickAdd("任务", NOW).priority).toBeUndefined();
  });

  it("> 人名 → waitingFor + suggestsWaiting", () => {
    const r = parseQuickAdd("等报价 > 李四", NOW);
    expect(r.title).toBe("等报价");
    expect(r.waitingFor).toBe("李四");
    expect(r.suggestsWaiting).toBe(true);
  });

  it("明天 → 明天 18:00", () => {
    const r = parseQuickAdd("交房租 明天", NOW);
    const expected = at(new Date(2026, 9, 25), 18, 0);
    expect(r.dueAt).toBe(expected);
  });

  it("今天 + 下午3点30", () => {
    const r = parseQuickAdd("开会 今天 下午3点30", NOW);
    expect(r.dueAt).toBe(at(new Date(2026, 9, 24), 15, 30));
  });

  it("周五（本周六解析时 → 下周五）", () => {
    const r = parseQuickAdd("检查服务器 周五", NOW);
    // NOW 是周六 10:00，本周五已过 → 下周五 18:00
    const expected = at(new Date(2026, 9, 30), 18, 0);
    expect(r.dueAt).toBe(expected);
  });

  it("下周三", () => {
    const r = parseQuickAdd("复盘 下周三", NOW);
    const expected = at(new Date(2026, 9, 28), 18, 0);
    expect(r.dueAt).toBe(expected);
  });

  it("3天后 / in 2 days", () => {
    expect(parseQuickAdd("浇水 3天后", NOW).dueAt).toBe(at(new Date(2026, 9, 27), 18, 0));
    expect(parseQuickAdd("water plants in 2 days", NOW).dueAt).toBe(at(new Date(2026, 9, 26), 18, 0));
  });

  it("12月1日（今年未过 → 今年）", () => {
    const r = parseQuickAdd("年会 12月1日", NOW);
    expect(r.dueAt).toBe(at(new Date(2026, 11, 1), 18, 0));
  });

  it("每天 → daily recurrence", () => {
    const r = parseQuickAdd("吃药 每天", NOW);
    expect(r.recurrence).toEqual({ freq: "daily", interval: 1, until: null });
    expect(r.title).toBe("吃药");
  });

  it("每周一三 → weekly byWeekday 收集多天", () => {
    const r = parseQuickAdd("健身 每周一 每周三", NOW);
    expect(r.recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 3], until: null });
    expect(r.title).toBe("健身");
  });

  it("英文混合 tomorrow 3pm", () => {
    const r = parseQuickAdd("call bob tomorrow 3pm", NOW);
    expect(r.title).toBe("call bob");
    expect(r.dueAt).toBe(at(new Date(2026, 9, 25), 15, 0));
  });

  it("复杂组合", () => {
    const r = parseQuickAdd("给客户回电话 @电话 #装修 !! 明天 上午9点", NOW);
    expect(r.title).toBe("给客户回电话");
    expect(r.contextNames).toEqual(["电话"]);
    expect(r.projectName).toBe("装修");
    expect(r.priority).toBe(2);
    expect(r.dueAt).toBe(at(new Date(2026, 9, 25), 9, 0));
  });
});

describe("recurrence 推进", () => {
  it("daily：从 anchor 向前推进到严格晚于 now", () => {
    const rule = { freq: "daily" as const, interval: 1, until: null };
    const anchor = at(new Date(2026, 9, 24), 18, 0); // 今天 18:00
    // now 是 10:00，anchor 未过 → 下一次是明天 18:00
    expect(nextOccurrence(anchor, rule, NOW)).toBe(at(new Date(2026, 9, 25), 18, 0));
    const lateNow = at(new Date(2026, 9, 25), 20, 0);
    expect(nextOccurrence(anchor, rule, lateNow)).toBe(at(new Date(2026, 9, 26), 18, 0));
  });

  it("weekly byWeekday [1,3]：取下一个周一或周三", () => {
    const rule = { freq: "weekly" as const, interval: 1, byWeekday: [1, 3], until: null };
    const anchor = at(new Date(2026, 9, 26), 18, 0); // 周一
    const next = nextOccurrence(anchor, rule, anchor + 1); // anchor 刚过
    expect(new Date(next ?? 0).getDay()).toBe(3); // 周三
  });

  it("monthly：月末钳制（1月31日 → 2月28日）", () => {
    const rule = { freq: "monthly" as const, interval: 1, until: null };
    const anchor = at(new Date(2027, 0, 31), 18, 0);
    const next = nextOccurrence(anchor, rule, anchor + 1);
    expect(new Date(next ?? 0).getDate()).toBe(28);
    expect(new Date(next ?? 0).getMonth()).toBe(1);
  });

  it("until 超限 → null", () => {
    const rule = {
      freq: "daily" as const,
      interval: 1,
      until: at(new Date(2026, 9, 25), 18, 0),
    };
    const anchor = at(new Date(2026, 9, 25), 18, 0);
    const lateNow = at(new Date(2026, 9, 25), 19, 0);
    expect(nextOccurrence(anchor, rule, lateNow)).toBeNull();
  });
});

function at(d: Date, hour: number, minute: number): number {
  const copy = new Date(d);
  copy.setHours(hour, minute, 0, 0);
  return copy.getTime();
}

// 防止未使用导入告警（startOfDay 被 quick-add 模块复用）
void startOfDay;

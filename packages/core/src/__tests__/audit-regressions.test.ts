import { describe, expect, test } from "bun:test";

import { nextOccurrence } from "../features/recurrence";
import { pickNextAction } from "../features/next-action";
import { coerceTask } from "../db/coerce";
import { buildReviewSummary } from "../features/review";
import { computeStats } from "../features/stats";
import { planBulkComplete } from "../features/bulk-ops";
import type { AppState } from "../store/app-store";
import type { Task } from "../models/task";

/**
 * 2026-11-23 逻辑审计的回归测试（6 项确认缺陷）。
 *
 * 每条都对应一个曾经可复现的真实错误；修复后在此固化，
 * 防止后续重构把行为改回去。审计报告见 docs/logic-audit-2026-11-23.md。
 */

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 2, 10, 0, 0).getTime(); // 2026-11-02 周一
const MONDAY = new Date(2026, 10, 2, 9, 0, 0).getTime();

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
    blockedBy: [],
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

function state(tasks: Task[]): AppState {
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    projects: {},
    sections: {},
    areas: {},
    contexts: {},
    templates: {},
    kv: {},
    lastError: null,
  };
}

describe("weekly 间隔与时刻（审计 #6）", () => {
  const seq = (interval: number, count = 3) => {
    let anchor = MONDAY;
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const next = nextOccurrence(anchor, { freq: "weekly", interval, byWeekday: [1] }, anchor);
      if (next === null) break;
      out.push(new Date(next).getDate());
      anchor = next;
    }
    return out;
  };

  test("每两周真的隔 14 天", () => {
    expect(seq(2)).toEqual([16, 30, 14]);
  });

  test("每周仍是 7 天", () => {
    expect(seq(1)).toEqual([9, 16, 23]);
  });

  test("每周多日：interval=2 时只在隔周的周一/周三触发", () => {
    const dates: string[] = [];
    let anchor = MONDAY;
    for (let i = 0; i < 4; i += 1) {
      const next = nextOccurrence(
        anchor,
        { freq: "weekly", interval: 2, byWeekday: [1, 3], originAt: MONDAY },
        anchor,
      );
      if (next === null) break;
      const d = new Date(next);
      dates.push(`${d.getMonth() + 1}/${d.getDate()}(${d.getDay()})`);
      anchor = next;
    }
    // 第 0 周：周一/周三；下一周整体跳过；第 2 周再来
    expect(dates).toEqual(["11/4(3)", "11/16(1)", "11/18(3)", "11/30(1)"]);
  });

  test("老数据没有 originAt 时回退到 anchor（保持向后兼容）", () => {
    // 以创建当周为第 0 周：第 1 周的周一被跳过，首个到期落在第 2 周
    const legacy = nextOccurrence(MONDAY, { freq: "weekly", interval: 2, byWeekday: [1] }, MONDAY);
    expect(new Date(legacy as number).getDate()).toBe(16);
  });

  test("每周重复保留原时刻（不再掉到 00:00）", () => {
    const next = nextOccurrence(MONDAY, { freq: "weekly", interval: 1, byWeekday: [1] }, MONDAY);
    expect(next).not.toBeNull();
    const d = new Date(next as number);
    expect([d.getHours(), d.getMinutes()]).toEqual([9, 0]);
  });
});

describe("已删除前置不再永久挡住首屏（审计 #4）", () => {
  test("软删前置后依赖任务可做，且与详情页口径一致", () => {
    const prereq = task({ id: "p1", title: "前置", deletedAt: NOW });
    const dependent = task({ id: "d1", title: "依赖它的任务", blockedBy: ["p1"] });
    const r = pickNextAction([prereq, dependent], NOW);
    expect(r.next?.id).toBe("d1");
    expect(r.blockedCount).toBe(0);
    expect(r.availableCount).toBe(1);
  });

  test("本地确实查不到的 id 仍然挡住（保守，既有语义）", () => {
    const r = pickNextAction([task({ id: "x", blockedBy: ["ghost"] })], NOW);
    expect(r.next).toBeNull();
    expect(r.blockedCount).toBe(1);
  });
});

describe("同步/导入保留每周多日（审计 #1）", () => {
  test("数字数组形式的 byWeekday 不被丢弃", () => {
    const t = coerceTask({
      id: "t1",
      title: "每周一三",
      recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3], until: null },
    });
    expect(t?.recurrence?.byWeekday).toEqual([1, 3]);
  });

  test("字符串数字形式也收敛为 number（兼容老数据/第三方导出）", () => {
    const t = coerceTask({
      id: "t2",
      title: "兼容",
      recurrence: { freq: "weekly", interval: 2, byWeekday: ["1", "3"] },
    });
    expect(t?.recurrence?.byWeekday).toEqual([1, 3]);
    expect(t?.recurrence?.interval).toBe(2);
  });

  test("非法星期值被过滤，不污染规则", () => {
    const t = coerceTask({
      id: "t3",
      title: "脏数据",
      recurrence: { freq: "weekly", interval: 1, byWeekday: [9, -1, 2.5, 1] },
    });
    expect(t?.recurrence?.byWeekday).toEqual([1]);
  });
});

describe("回顾与统计口径一致（审计 #5）", () => {
  test("重复任务的完成同时计入两处", () => {
    const recurring = task({
      id: "r1",
      title: "每天喝水",
      recurrence: { freq: "daily", interval: 1, until: null },
      lastCompletedAt: NOW - 3_600_000,
      createdAt: NOW - 3 * DAY,
    });
    const s = state([recurring]);
    expect(buildReviewSummary(s, NOW).completedLastWeek).toBe(1);
    expect(computeStats(s, NOW).completed7d).toBe(1);
  });

  test("普通任务完成数仍只算一次", () => {
    const plain = task({ id: "t1", status: "done", completedAt: NOW - 3600_000 });
    const s = state([plain]);
    expect(buildReviewSummary(s, NOW).completedLastWeek).toBe(1);
    expect(computeStats(s, NOW).completed7d).toBe(1);
  });
});

describe("批量完成撤销带回快照（审计 #3）", () => {
  test("带快照时 undo 附带 restore，能还原状态与到期日", () => {
    const plan = planBulkComplete([
      { id: "a", status: "waiting", dueAt: 123, lastCompletedAt: null },
    ]);
    expect(plan.run).toEqual([{ op: "task.complete", payload: { id: "a" } }]);
    expect(plan.undo).toEqual([
      {
        op: "task.uncomplete",
        payload: { id: "a", restore: { status: "waiting", dueAt: 123, lastCompletedAt: null } },
      },
    ]);
  });

  test("只传 id 时保持旧形状（向后兼容）", () => {
    const plan = planBulkComplete(["a"]);
    expect(plan.undo).toEqual([{ op: "task.uncomplete", payload: { id: "a" } }]);
  });
});

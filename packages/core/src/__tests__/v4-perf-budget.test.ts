import { describe, expect, test } from "bun:test";

import { getAllTasks, getMaterials, getTodayTasks } from "../store/selectors/tasks";
import { searchAll } from "../features/search";
import { computeStats } from "../features/stats";
import { countText, clearWordCountCache } from "../features/word-count";
import { totalBodyWords } from "../features/writing-stats";
import type { AppState } from "../store/app-store";
import type { Task } from "../models/task";

/**
 * 性能预算：抓"数量级退化"，不是精确基准。
 *
 * 阈值刻意宽松（CI 机器与本地差异大），目的是拦住"不小心把 O(n) 变成 O(n·全文长度)"
 * 或"每次渲染重新遍历全库"这类问题。真实数字见 `bench/perf-baseline.ts`。
 */

const NOW = Date.UTC(2026, 10, 5, 6, 0, 0);
const COUNT = 2000;
const BODY = "雨打在窗上，像一场没有人听的比喻。".repeat(50).slice(0, 800);

function buildState(): AppState {
  const tasks: Task[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    tasks.push({
      id: `0192a4c1-7f3e-7abc-8def-${String(i).padStart(12, "0")}`,
      createdAt: NOW - i * 1000,
      updatedAt: NOW - i * 500,
      revision: 1,
      deletedAt: null,
      title: i % 7 === 0 ? `写稿 第${i}篇` : `任务 ${i}`,
      notes: i % 3 === 0 ? BODY : "",
      status: i % 5 === 0 ? "someday" : i % 3 === 0 ? "done" : "next",
      priority: (i % 4) as 0 | 1 | 2 | 3,
      deferUntil: null,
      dueAt: i % 10 === 0 ? NOW + i * 60_000 : null,
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
      orderKey: String(i).padStart(10, "0"),
    } as Task);
  }
  return {
    loaded: true,
    tasks: Object.fromEntries(tasks.map((task) => [task.id, task])),
    projects: {},
    sections: {},
    contexts: {},
    areas: {},
    templates: {},
    kv: {},
    lastError: null,
  };
}

function medianMs(fn: () => unknown, iterations = 5): number {
  fn(); // 预热
  const runs: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn();
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)] ?? 0;
}

describe("性能预算 · 派生计算", () => {
  test("全库字数统计（缓存命中后）< 20ms", () => {
    clearWordCountCache();
    const state = buildState();
    const tasks = Object.values(state.tasks);
    // 首次是冷启动（真实开销），后续走缓存
    totalBodyWords(tasks);
    expect(medianMs(() => totalBodyWords(tasks))).toBeLessThan(20);
  });

  test("今天视图 < 30ms（2000 条）", () => {
    const state = buildState();
    expect(medianMs(() => getTodayTasks(state, NOW))).toBeLessThan(30);
  });

  test("素材库 < 30ms（2000 条）", () => {
    const state = buildState();
    expect(medianMs(() => getMaterials(state))).toBeLessThan(30);
  });

  test("搜索（单词/双词）< 80ms（2000 条）", () => {
    const state = buildState();
    expect(medianMs(() => searchAll(state, "雨", NOW))).toBeLessThan(80);
    expect(medianMs(() => searchAll(state, "雨 比喻", NOW))).toBeLessThan(80);
  });

  test("统计面板 < 40ms（2000 条）", () => {
    const state = buildState();
    expect(medianMs(() => computeStats(state, NOW))).toBeLessThan(40);
  });
});

describe("性能预算 · 引用稳定性（比时间更重要）", () => {
  test("getAllTasks 对同一快照返回同一数组引用", () => {
    const state = buildState();
    const first = getAllTasks(state);
    const second = getAllTasks(state);
    expect(first).toBe(second);
  });

  test("store 的 tasks 换成新对象后，getAllTasks 才重新求值", () => {
    const state = buildState();
    const first = getAllTasks(state);
    const nextState: AppState = { ...state, tasks: { ...state.tasks } };
    const second = getAllTasks(nextState);
    expect(second).not.toBe(first);
    expect(second.length).toBe(first.length);
  });
});

describe("字数缓存", () => {
  test("同一文本第二次调用更快（命中缓存）", () => {
    clearWordCountCache();
    const text = "写".repeat(1000);
    const cold = medianMs(() => countText(text), 3);
    const warm = medianMs(() => countText(text), 20);
    expect(warm).toBeLessThanOrEqual(Math.max(cold, 1));
  });

  test("超长文本不进缓存（避免吃内存），但结果仍正确", () => {
    clearWordCountCache();
    const huge = "字".repeat(20_000);
    expect(countText(huge).words).toBe(20_000);
    expect(countText(huge).words).toBe(20_000);
  });

  test("缓存不会让不同文本串味", () => {
    clearWordCountCache();
    expect(countText("abc").words).toBe(1);
    expect(countText("abcdef").words).toBe(1);
    expect(countText("中文").words).toBe(2);
  });
});

import { describe, expect, test } from "bun:test";

import { fuzzyScore } from "../lib/fuzzy";

/** 采纳的优化项：命令面板打分函数从组件抽出，可独立单测 */
describe("fuzzyScore（命令面板打分）", () => {
  test("全等 100 > 前缀 80 > 包含 60 > 子序列 30 > 不匹配 0", () => {
    expect(fuzzyScore("买牛奶", "买牛奶")).toBe(100);
    expect(fuzzyScore("买牛奶", "买牛")).toBe(80);
    expect(fuzzyScore("买牛奶", "牛奶")).toBe(60);
    expect(fuzzyScore("买牛奶", "牛")).toBe(60);
    expect(fuzzyScore("hello world", "hlo")).toBe(30); // 子序列
    expect(fuzzyScore("买牛奶", "不存在")).toBe(0);
  });

  test("大小写不敏感；空 query = 1（显示全部候选）", () => {
    expect(fuzzyScore("TODO list", "todo")).toBe(80); // 前缀（非全等）
    expect(fuzzyScore("anything", "")).toBe(1);
  });

  test("排序稳定性：前缀 > 包含，同分按原始顺序", () => {
    const items = ["Palapa", "Alpaca"];
    const ranked = items
      .map((label, index) => ({ label, index, s: fuzzyScore(label, "alp") }))
      .sort((a, b) => b.s - a.s || a.index - b.index);
    expect(ranked[0]?.label).toBe("Alpaca"); // 前缀 80
    expect(ranked[1]?.label).toBe("Palapa"); // 包含 60
  });
});

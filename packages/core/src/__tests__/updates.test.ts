import { describe, expect, test } from "bun:test";

import { compareVersion, readPendingUpdate, shouldAutoCheck } from "../updates";

const REPO_URL = "https://github.com/czchengzhi404/gtd-app/releases/latest";

describe("compareVersion", () => {
  test("按段比较，不是按字符串", () => {
    expect(compareVersion("2.7.10", "2.7.9")).toBeGreaterThan(0);
    expect(compareVersion("2.10.0", "2.9.0")).toBeGreaterThan(0);
    expect(compareVersion("2.7.6", "2.7.6")).toBe(0);
    expect(compareVersion("2.7.5", "2.7.6")).toBeLessThan(0);
  });

  test("容忍 v 前缀", () => {
    expect(compareVersion("v2.7.6", "2.7.6")).toBe(0);
  });

  test("段数不一致时缺的按 0 算", () => {
    expect(compareVersion("2.7", "2.7.0")).toBe(0);
    expect(compareVersion("2.7.1", "2.7")).toBeGreaterThan(0);
  });

  test("非数字段当 0，不抛异常", () => {
    expect(compareVersion("2.x.6", "2.0.6")).toBe(0);
  });
});

describe("readPendingUpdate", () => {
  test("kv 里没有记录时不提示", () => {
    expect(readPendingUpdate({}, "2.7.6", REPO_URL)).toBeNull();
    expect(readPendingUpdate({ "update.latest": "" }, "2.7.6", REPO_URL)).toBeNull();
  });

  test("记录版本更高时提示，并带上 url", () => {
    const result = readPendingUpdate(
      { "update.latest": "2.8.0", "update.url": "https://example.com/dl" },
      "2.7.6",
      REPO_URL,
    );
    expect(result).toEqual({ version: "2.8.0", url: "https://example.com/dl" });
  });

  test("没有 url 时回落到默认 release 页", () => {
    const result = readPendingUpdate({ "update.latest": "2.8.0" }, "2.7.6", REPO_URL);
    expect(result).toEqual({ version: "2.8.0", url: REPO_URL });
  });

  test("记录的版本不比当前新就不提示（用户已手动升级）", () => {
    expect(readPendingUpdate({ "update.latest": "2.7.6" }, "2.7.6", REPO_URL)).toBeNull();
    expect(readPendingUpdate({ "update.latest": "2.7.5" }, "2.7.6", REPO_URL)).toBeNull();
  });
});

describe("shouldAutoCheck", () => {
  const DAY = 24 * 60 * 60 * 1000;

  test("从没查过就查", () => {
    expect(shouldAutoCheck(0, Date.now(), DAY)).toBe(true);
    expect(shouldAutoCheck(Number.NaN, Date.now(), DAY)).toBe(true);
  });

  test("一天内不重复查", () => {
    const now = Date.now();
    expect(shouldAutoCheck(now - 1000, now, DAY)).toBe(false);
    expect(shouldAutoCheck(now - 23 * 60 * 60 * 1000, now, DAY)).toBe(false);
  });

  test("超过一天就查", () => {
    const now = Date.now();
    expect(shouldAutoCheck(now - DAY - 1, now, DAY)).toBe(true);
  });
});

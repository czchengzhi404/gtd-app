import { afterEach, describe, expect, test } from "bun:test";

import { getLang, restoreLang, setLang } from "../i18n";

afterEach(() => {
  // 每项都从同一个明确的基线开始，避免 vanilla store 跨测试泄漏。
  setLang("en");
});

describe("持久化语言恢复", () => {
  test("启动时恢复保存的中文偏好", () => {
    setLang("en");
    restoreLang("zh");
    expect(getLang()).toBe("zh");
  });

  test("启动时恢复保存的英文偏好", () => {
    setLang("zh");
    restoreLang("en");
    expect(getLang()).toBe("en");
  });

  test("KV 缺失或无效时保留系统语言探测值", () => {
    setLang("zh");
    restoreLang(undefined);
    expect(getLang()).toBe("zh");
    restoreLang("fr");
    expect(getLang()).toBe("zh");
  });
});

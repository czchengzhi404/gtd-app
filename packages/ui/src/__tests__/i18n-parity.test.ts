import { describe, expect, test } from "bun:test";

import { MESSAGES } from "../i18n";

/**
 * 中英词典一致性。
 *
 * 这套 UI 所有文案都走 t(key)；缺键时 t() 会静默回退到中文，再不行就返回 key 本身
 * —— 界面不会报错，只会冒出「sync.pageIntro」这种原文，很容易漏到线上。
 * 这里把三件事钉死：
 *   1. 两边键集完全相同
 *   2. 没有空值
 *   3. 同一条文案里的 {占位符} 集合相同（否则格式化时一边会残留 {n}）
 */

const LANGS = ["zh", "en"] as const;

const keysOf = (lang: (typeof LANGS)[number]) => Object.keys(MESSAGES[lang]).sort();

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();

describe("i18n 中英对齐", () => {
  test("中英键集完全相同", () => {
    const zhOnly = keysOf("zh").filter((k) => !(k in MESSAGES.en));
    const enOnly = keysOf("en").filter((k) => !(k in MESSAGES.zh));
    expect({ zhOnly, enOnly }).toEqual({ zhOnly: [], enOnly: [] });
  });

  test("没有空文案", () => {
    const empty: string[] = [];
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(MESSAGES[lang])) {
        if (value.trim().length === 0) empty.push(`${lang}:${key}`);
      }
    }
    expect(empty).toEqual([]);
  });

  test("同一条文案的占位符两边一致", () => {
    const mismatched: { key: string; zh: string[]; en: string[] }[] = [];
    for (const key of keysOf("zh")) {
      if (!(key in MESSAGES.en)) continue;
      const zh = placeholders(MESSAGES.zh[key] ?? "");
      const en = placeholders(MESSAGES.en[key] ?? "");
      if (zh.join(",") !== en.join(",")) mismatched.push({ key, zh, en });
    }
    expect(mismatched).toEqual([]);
  });

  test("键名没有前后空白", () => {
    const dirty = LANGS.flatMap((lang) =>
      Object.keys(MESSAGES[lang])
        .filter((k) => k !== k.trim())
        .map((k) => `${lang}:${JSON.stringify(k)}`),
    );
    expect(dirty).toEqual([]);
  });
});

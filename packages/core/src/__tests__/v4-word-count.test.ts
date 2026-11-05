import { describe, expect, test } from "bun:test";

import { countText, countWords, sumTextCounts } from "../features/word-count";

describe("countText · 中文", () => {
  test("纯汉字：每字计 1", () => {
    expect(countText("今天天气很好").words).toBe(6);
  });

  test("含全角标点：标点不计入字数，但计入字符数", () => {
    const result = countText("今天，天气很好。");
    expect(result.words).toBe(6);
    // 今 天 ， 天 气 很 好 。 = 8 个字符（2 汉字 + 1 标点 + 4 汉字 + 1 标点）
    expect(result.characters).toBe(8);
  });

  test("中文数字与拉丁数字混排", () => {
    // 「第」+「3」+「章」+「写」+「了」+「2000」+「字」 = 汉字 5 + 数字 2 词
    expect(countText("第3章写了2000字").words).toBe(7);
  });
});

describe("countText · 英文", () => {
  test("空格分隔的词各计 1", () => {
    expect(countText("the quick brown fox").words).toBe(4);
  });

  test("连字符与撇号不拆词", () => {
    expect(countText("don't state-of-the-art").words).toBe(2);
  });

  test("纯标点不计词", () => {
    expect(countText("...!!!").words).toBe(0);
    expect(countText("...!!!").characters).toBe(6);
  });
});

describe("countText · 混排与边界", () => {
  test("中英混排相加", () => {
    // 汉字 3（写 点 和）+ 英文 2 词（notes / draft）
    expect(countText("写点 notes 和 draft").words).toBe(5);
  });

  test("空串全零", () => {
    expect(countText("")).toEqual({
      cjk: 0,
      latin: 0,
      words: 0,
      characters: 0,
      paragraphs: 0,
      readingMinutes: 0,
      writingMinutes: 0,
    });
  });

  test("emoji 按码点计 1 个字符，且不计入字数", () => {
    const result = countText("写完了🎉");
    expect(result.characters).toBe(4);
    expect(result.words).toBe(3);
  });

  test("段落数只算非空行", () => {
    expect(countText("第一段\n\n第二段\n   \n第三段").paragraphs).toBe(3);
  });

  test("单行也算一段", () => {
    expect(countText("只有一行").paragraphs).toBe(1);
  });

  test("阅读时长按 400 字/分钟向上取整，最少 1 分钟", () => {
    expect(countText("一").readingMinutes).toBe(1);
    expect(countText("字".repeat(400)).readingMinutes).toBe(1);
    expect(countText("字".repeat(401)).readingMinutes).toBe(2);
  });

  test("写作时长按 300 字/小时", () => {
    // 300 字 = 1 小时
    expect(countText("字".repeat(300)).writingMinutes).toBe(60);
  });
});

describe("countWords / sumTextCounts", () => {
  test("countWords 与 countText().words 一致", () => {
    const sample = "写点 notes 和 draft";
    expect(countWords(sample)).toBe(countText(sample).words);
  });

  test("合计只累加原始计数，时长按总量重算", () => {
    const a = countText("字".repeat(200));
    const b = countText("字".repeat(200));
    const total = sumTextCounts([a, b]);
    expect(total.words).toBe(400);
    expect(total.cjk).toBe(400);
    // 400 字 / 400 每分钟 = 1 分钟（不是 1+1=2）
    expect(total.readingMinutes).toBe(1);
    expect(total.paragraphs).toBe(2);
  });

  test("空数组全零且不报错", () => {
    expect(sumTextCounts([]).words).toBe(0);
    expect(sumTextCounts([]).readingMinutes).toBe(0);
  });
});

import { afterEach, describe, expect, test } from "bun:test";

import { formatDate, formatDateTime, formatTime } from "../format/date";
import { restoreLang } from "../i18n";

/**
 * 日期时间格式化的确定性保证。
 *
 * 这些断言的意义：以前用 toLocaleString()，输出跟随设备区域，
 * 中文界面在英文系统上会显示「11/23/2026, 2:55:28 PM」；
 * 现在由界面语言唯一决定，任何设备都一样。
 */

const SAMPLE = new Date(2026, 10, 23, 14, 5, 9).getTime(); // 2026-11-23 14:05:09
const MORNING = new Date(2026, 10, 23, 9, 7, 0).getTime(); // 09:07

afterEach(() => {
  restoreLang("zh");
});

describe("中文（默认）", () => {
  test("日期为年/月/日，补零", () => {
    expect(formatDate(SAMPLE)).toBe("2026/11/23");
  });

  test("时间为 24 小时制", () => {
    expect(formatTime(SAMPLE)).toBe("14:05");
    expect(formatTime(MORNING)).toBe("09:07");
  });

  test("日期时间拼接", () => {
    expect(formatDateTime(SAMPLE)).toBe("2026/11/23 14:05");
  });

  test("带秒", () => {
    expect(formatTime(SAMPLE, { seconds: true })).toBe("14:05:09");
  });
});

describe("英文", () => {
  test("日期为月/日/年", () => {
    restoreLang("en");
    expect(formatDate(SAMPLE)).toBe("11/23/2026");
  });

  test("时间为 12 小时制带 AM/PM", () => {
    restoreLang("en");
    expect(formatTime(SAMPLE)).toBe("2:05 PM");
    expect(formatTime(MORNING)).toBe("9:07 AM");
  });

  test("午夜与正午显示 12", () => {
    restoreLang("en");
    const midnight = new Date(2026, 10, 23, 0, 30, 0).getTime();
    const noon = new Date(2026, 10, 23, 12, 30, 0).getTime();
    expect(formatTime(midnight)).toBe("12:30 AM");
    expect(formatTime(noon)).toBe("12:30 PM");
  });
});

describe("边界", () => {
  test("非法时间返回空串而不是 Invalid Date", () => {
    expect(formatDate(Number.NaN)).toBe("");
    expect(formatTime(Number.NaN)).toBe("");
  });
});

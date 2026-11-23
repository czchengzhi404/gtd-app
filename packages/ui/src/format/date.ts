import { getLang } from "../i18n";

/**
 * 日期时间格式化（按界面语言，不依赖系统区域）。
 *
 * 为什么不用 toLocaleString()：它不带 locale 时跟随**设备区域**，
 * 中文界面上于是出现「11/23/2026, 2:55:28 PM」这种美式格式；
 * 即使传了 "zh-CN"，Hermes 在缺少完整 ICU 数据的构建上也可能忽略参数。
 * 这里直接按语言拼字符串，行为可预测、可在测试里断言。
 *
 * 口径：
 * - 中文：2026/11/23、14:05（24 小时制）
 * - 英文：11/23/2026、2:05 PM（12 小时制）
 */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isEnglish(): boolean {
  return getLang() === "en";
}

/** 只到日期：中文 2026/11/23；英文 11/23/2026 */
export function formatDate(ms: number): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return "";
  return isEnglish()
    ? `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
    : `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

/** 只到时间：中文 24 小时制；英文 12 小时制带 AM/PM */
export function formatTime(ms: number, options?: { seconds?: boolean }): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return "";
  const seconds = options?.seconds === true ? `:${pad2(date.getSeconds())}` : "";
  if (isEnglish()) {
    const hour12 = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
    const suffix = date.getHours() < 12 ? "AM" : "PM";
    return `${hour12}:${pad2(date.getMinutes())}${seconds} ${suffix}`;
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}${seconds}`;
}

/** 日期 + 时间 */
export function formatDateTime(ms: number, options?: { seconds?: boolean }): string {
  return `${formatDate(ms)} ${formatTime(ms, options)}`;
}

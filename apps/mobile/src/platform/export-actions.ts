/**
 * 数据导出动作：Markdown / ICS / 备份 JSON。
 *
 * 数据来源：Markdown / ICS 用 store 快照（`appStore.getState()`）；备份 JSON 走
 * `collectLocalRecords` + `formatBackupJSON`（含附件元数据、信封可被导入器读回）。
 * 字符串生成全部在 core 的纯导出器里，本文件只负责"落到用户能拿到的地方"：
 * - 桌面（Electron）：dialog.save 选路径 + fs.writeFile 写入；
 * - Android「保存」：系统文件选择器（SAF）写进用户挑的目录，文件管理器里能看到；
 * - Android/iOS「分享」：写沙盒 documents 后交给系统分享面板（可选「存储到文件」）；
 * - 纯浏览器 web：没有存储端口，明确报错而不是静默失败。
 *
 * 返回值：`{ path, mode, fileName }`；用户取消时返回 null。
 * `mode === "saved"` 表示真的落到了用户选的目录，"shared" 表示交给了系统分享面板。
 */
import { Platform } from "react-native";
import {
  appStore,
  collectLocalRecords,
  formatBackupJSON,
  getSqliteExecutor,
  toICS,
  toMarkdown,
} from "@gtd/core";
import { t } from "@gtd/ui";

import { gtd } from "./gtd-api";
import { isDesktop } from "./env";

export type ExportKind = "markdown" | "ics" | "json";

/** 导出目标：直接保存到目录，或交给系统分享面板 */
export type SaveTarget = "save" | "share";

export interface SaveResult {
  /** 文件位置（saved 为用户选的目录，shared 为沙盒内 URI） */
  path: string;
  mode: "saved" | "shared";
  /** 供 UI 展示的文件名 */
  fileName: string;
}

const MIME_BY_KIND: Record<ExportKind, string> = {
  markdown: "text/markdown",
  ics: "text/calendar",
  json: "application/json",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 本地日期戳：gtd-2026-11-01.md（文件名可读、可排序） */
function dateStamp(now: number): string {
  const date = new Date(now);
  return `${String(date.getFullYear())}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fileNameFor(kind: ExportKind, now: number): string {
  const ext = kind === "markdown" ? "md" : kind;
  return `gtd-${dateStamp(now)}.${ext}`;
}

/** SAF 返回的 content:// URI 直接展示给用户没有意义，尽量还原成可读路径 */
function readablePath(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const marker = decoded.indexOf("primary:");
    if (marker >= 0) return decoded.slice(marker + "primary:".length);
    return decoded;
  } catch {
    return uri;
  }
}

/**
 * Android：用系统文件选择器让用户挑目录，把文件真正写出去。
 * 用户取消授权时返回 null（调用方据此当作取消，不提示成功）。
 */
async function saveWithSaf(
  fileName: string,
  content: string,
  mimeType: string,
): Promise<SaveResult | null> {
  const fs = await import("expo-file-system/legacy");
  const saf = fs.StorageAccessFramework;
  if (saf === undefined) return null;

  const permission = await saf.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;

  const uri = await saf.createFileAsync(permission.directoryUri, fileName, mimeType);
  await fs.writeAsStringAsync(uri, content, { encoding: fs.EncodingType.UTF8 });
  return { path: readablePath(uri), mode: "saved", fileName };
}

/**
 * 保存文本文件。
 * @param fileName 建议文件名（桌面保存对话框的默认名 / 移动端文件名）
 * @param content 纯文本内容
 * @param mimeType 分享面板使用的 MIME 类型
 * @param target "save" 存到用户目录（Android SAF）；"share" 交给系统分享面板
 * @returns 保存结果；用户取消返回 null
 */
export async function saveTextFile(
  fileName: string,
  content: string,
  mimeType: string,
  target: SaveTarget = "save",
): Promise<SaveResult | null> {
  if (isDesktop()) {
    const picked = await gtd().dialog.save({ defaultPath: fileName });
    if (picked === null) return null;
    const ok = await gtd().fs.writeFile(picked, content);
    if (!ok) throw new Error(t("more.status.exportFailed"));
    return { path: picked, mode: "saved", fileName };
  }

  if (Platform.OS === "web") {
    throw new Error(t("platform.webUnsupported"));
  }

  // Android 保存：走 SAF，文件真的落到「下载 / 文档」里
  if (Platform.OS === "android" && target === "save") {
    const saved = await saveWithSaf(fileName, content, mimeType);
    if (saved !== null) return saved;
    // 用户在目录选择器里取消 → 当作取消，不再弹分享面板
    return null;
  }

  // iOS / Android 分享：写沙盒 documents（不用 cache：缓存可能被系统清掉）
  const fs = await import("expo-file-system/legacy");
  const dir = fs.documentDirectory ?? fs.cacheDirectory ?? "";
  const uri = `${dir}${fileName}`;
  await fs.writeAsStringAsync(uri, content, { encoding: fs.EncodingType.UTF8 });

  const sharing = await import("expo-sharing");
  if (!(await sharing.isAvailableAsync())) {
    throw new Error(t("platform.shareUnavailable"));
  }
  await sharing.shareAsync(uri, { mimeType, dialogTitle: fileName });
  return { path: uri, mode: "shared", fileName };
}

/** 未完成任务清单（Markdown，含笔记摘要）；includeCompleted 时连已完成的稿子一起导出 */
export async function exportMarkdown(
  target: SaveTarget = "save",
  includeCompleted = false,
): Promise<SaveResult | null> {
  const now = Date.now();
  const content = toMarkdown(appStore.getState(), { includeNotes: true, includeCompleted });
  return saveTextFile(fileNameFor("markdown", now), content, MIME_BY_KIND.markdown, target);
}

/**
 * 导出单条正文（写作者最常用：把这篇稿子发给别人 / 存到别处）。
 * 文件名取任务标题（去掉文件系统非法字符），内容就是 notes 原文。
 */
export async function exportNote(
  title: string,
  notes: string,
  target: SaveTarget = "save",
): Promise<SaveResult | null> {
  const safeTitle =
    title
      .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "note";
  const now = Date.now();
  const stamp = `${now}`;
  return saveTextFile(`${safeTitle}-${stamp}.md`, notes, MIME_BY_KIND.markdown, target);
}

/** 有到期日的任务 → iCalendar（可直接导入系统日历） */
export async function exportICS(target: SaveTarget = "save"): Promise<SaveResult | null> {
  const now = Date.now();
  const state = appStore.getState();
  const content = toICS(Object.values(state.tasks), now);
  return saveTextFile(fileNameFor("ics", now), content, MIME_BY_KIND.ics, target);
}

/**
 * 全量备份 JSON。
 *
 * 走 `collectLocalRecords` + `formatBackupJSON`（而不是 store 快照）：
 * 这条路径能带上附件元数据，且信封与 `importFromFile` / `exportAllToFile`
 * 完全一致（`{app:"gtd", version:1, exportedAt, records}`），导出的文件能导回来。
 */
export async function exportBackupJSON(target: SaveTarget = "save"): Promise<SaveResult | null> {
  const now = Date.now();
  const records = await collectLocalRecords(getSqliteExecutor());
  const content = formatBackupJSON(records, now);
  return saveTextFile(fileNameFor("json", now), content, MIME_BY_KIND.json, target);
}

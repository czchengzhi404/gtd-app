/**
 * 轻量 Markdown 解析（纯逻辑，无 React / 无 react-native）。
 *
 * 为什么单独成文件：组件文件会引入 react-native，导致 `bun test` 去解析 RN 的
 * Flow 源码而失败。解析是纯函数，抽出来后可以直接单测，组件只负责渲染。
 *
 * 支持：标题 #~###、无序/有序列表（含缩进层级）、任务清单、引用、代码块、
 *      分隔线、行内 `code` / **粗体** / *斜体* / [链接](url)。
 * 不支持表格与图片——笔记场景够用，也避免引入解析库体积。
 */

/** 列表缩进：2 空格一层，最多 4 层（再深按 4 层渲染，避免窄屏挤成一条） */
export const MD_MAX_DEPTH = 4;
export const MD_INDENT_UNIT = 2;

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; depth: number; text: string }
  | { kind: "ordered"; depth: number; index: number; text: string }
  | { kind: "task"; depth: number; done: boolean; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "divider" };

/** 前导空格 → 层级（tab 按 2 空格算） */
function indentDepth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += MD_INDENT_UNIT;
    else break;
  }
  return Math.min(MD_MAX_DEPTH, Math.floor(width / MD_INDENT_UNIT));
}

/** 有序列表：`1. 文本` / `1) 文本` */
function matchOrdered(trimmed: string): { index: number; text: string } | null {
  const match = /^(\d{1,3})[.)]\s+(.*)$/.exec(trimmed);
  if (match === null) return null;
  const text = (match[2] ?? "").trim();
  if (text.length === 0) return null;
  return { index: Number(match[1]), text };
}

/** 任务清单：`- [ ]` / `- [x]` / `* [X]` */
function matchTaskItem(trimmed: string): { done: boolean; text: string } | null {
  if (!trimmed.startsWith("- [") && !trimmed.startsWith("* [")) return null;
  if (trimmed.length < 6) return null;
  const mark = trimmed[3];
  if (mark !== " " && mark !== "x" && mark !== "X") return null;
  if (trimmed[4] !== "]" || trimmed[5] !== " ") return null;
  return { done: mark !== " ", text: trimmed.slice(6).trim() };
}

/** 逐行解析成块序列（纯函数，可单测；不使用回溯型正则） */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        blocks.push({ kind: "code", text: codeBuffer.join("\n") });
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }
    if (trimmed.length === 0) continue;

    // 分隔线必须整行只有符号（缩进的分隔线也算分隔线）
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ kind: "divider" });
      continue;
    }

    const depth = indentDepth(line);

    const task = matchTaskItem(trimmed);
    if (task !== null) {
      blocks.push({ kind: "task", depth, done: task.done, text: task.text });
      continue;
    }

    // 标题：#~###（标题忽略缩进）
    if (trimmed.startsWith("#")) {
      let level = 0;
      while (level < trimmed.length && trimmed[level] === "#") level++;
      if (level >= 1 && level <= 3 && trimmed[level] === " ") {
        blocks.push({
          kind: "heading",
          level: level as 1 | 2 | 3,
          text: trimmed.slice(level + 1).trim(),
        });
        continue;
      }
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      blocks.push({ kind: "bullet", depth, text: trimmed.slice(2).trim() });
      continue;
    }

    const ordered = matchOrdered(trimmed);
    if (ordered !== null) {
      blocks.push({ kind: "ordered", depth, index: ordered.index, text: ordered.text });
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push({ kind: "quote", text: trimmed.replace(/^>\s?/, "") });
      continue;
    }

    blocks.push({ kind: "paragraph", text: trimmed });
  }

  if (inCode && codeBuffer.length > 0) {
    blocks.push({ kind: "code", text: codeBuffer.join("\n") });
  }
  return blocks;
}

export interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

/**
 * 行内格式解析：`code` → [文本](链接) → **粗体** → *斜体*。
 * 用顺序扫描而非正则，遇到未闭合标记按普通文本处理（不会吞掉内容）。
 */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ text: buffer });
      buffer = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        segments.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      const openParen = closeBracket >= 0 ? text.indexOf("(", closeBracket + 1) : -1;
      const closeParen = openParen >= 0 ? text.indexOf(")", openParen + 1) : -1;
      if (closeBracket > i && openParen === closeBracket + 1 && closeParen > openParen + 1) {
        flush();
        segments.push({
          text: text.slice(i + 1, closeBracket),
          link: text.slice(openParen + 1, closeParen),
        });
        i = closeParen + 1;
        continue;
      }
    }

    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        segments.push({ text: text.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) {
        flush();
        segments.push({ text: text.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return segments.length > 0 ? segments : [{ text }];
}

/** 仅允许 http/https 链接（避免笔记里的恶意 scheme 触发系统应用） */
export function safeHttpUrl(url: string): string | null {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith("https://") || lower.startsWith("http://")) return url.trim();
  return null;
}

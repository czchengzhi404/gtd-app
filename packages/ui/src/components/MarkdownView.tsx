import type { ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { radius, space } from "../theme/tokens";

/**
 * 轻量 Markdown 渲染（无第三方依赖，移动端/桌面端行为一致）。
 * 支持：标题 # ## ###、无序列表、任务清单 - [ ] / - [x]、
 *      引用 >、代码块 ```、行内 `code`、**粗体**、*斜体*、[链接](url)。
 * 不支持嵌套列表与表格——笔记场景够用，也避免引入解析库体积。
 */

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "task"; done: boolean; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "divider" };

/** 逐行解析成块序列（纯函数，可单测；不使用正则以避免回溯风险） */
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

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ kind: "divider" });
      continue;
    }

    // 任务清单：- [ ] / - [x]
    const task = matchTaskItem(trimmed);
    if (task !== null) {
      blocks.push({ kind: "task", done: task.done, text: task.text });
      continue;
    }

    // 标题：#~###
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

    // 无序列表
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      blocks.push({ kind: "bullet", text: trimmed.slice(2).trim() });
      continue;
    }

    // 引用
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

function matchTaskItem(trimmed: string): { done: boolean; text: string } | null {
  if (!trimmed.startsWith("- [") && !trimmed.startsWith("* [")) return null;
  if (trimmed.length < 6) return null;
  const mark = trimmed[3];
  if (mark !== " " && mark !== "x" && mark !== "X") return null;
  if (trimmed[4] !== "]" || trimmed[5] !== " ") return null;
  return { done: mark !== " ", text: trimmed.slice(6).trim() };
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

    // 行内代码
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        segments.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }

    // 链接
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

    // 粗体
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        segments.push({ text: text.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }

    // 斜体
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

export interface MarkdownViewProps {
  source: string;
}

/** Markdown 渲染视图（笔记展示用） */
export function MarkdownView({ source }: MarkdownViewProps) {
  const colors = useTheme();
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const size = block.level === 1 ? 20 : block.level === 2 ? 17 : 15;
            return (
              <AppText
                key={index}
                variant="bodyStrong"
                lines={3}
                style={{ fontSize: size, lineHeight: size + 6, marginTop: index === 0 ? 0 : space.sm }}
              >
                {block.text}
              </AppText>
            );
          }
          case "bullet":
            return (
              <View key={index} style={styles.bulletRow}>
                <AppText variant="body" tone="tertiary" lines={1}>
                  •
                </AppText>
                <InlineText text={block.text} />
              </View>
            );
          case "task":
            return (
              <View key={index} style={styles.bulletRow}>
                <AppText variant="label" color={block.done ? colors.success : colors.textTertiary} lines={1}>
                  {block.done ? "☑" : "☐"}
                </AppText>
                <InlineText text={block.text} dimmed={block.done} />
              </View>
            );
          case "quote":
            return (
              <View key={index} style={[styles.quote, { borderLeftColor: colors.borderStrong }]}>
                <InlineText text={block.text} dimmed />
              </View>
            );
          case "code":
            return (
              <View key={index} style={[styles.code, { backgroundColor: colors.surfaceMuted }]}>
                <AppText variant="mono" lines={40} style={styles.codeText}>
                  {block.text}
                </AppText>
              </View>
            );
          case "divider":
            return <View key={index} style={[styles.divider, { backgroundColor: colors.border }]} />;
          case "paragraph":
          default:
            return (
              <View key={index} style={styles.paragraph}>
                <InlineText text={block.text} />
              </View>
            );
        }
      })}
    </View>
  );
}

function InlineText({ text, dimmed = false }: { text: string; dimmed?: boolean }) {
  const colors = useTheme();
  const segments = parseInline(text);
  const nodes: ReactNode[] = segments.map((segment, index) => {
    if (segment.code === true) {
      return (
        <AppText
          key={index}
          variant="mono"
          color={colors.text}
          style={{ backgroundColor: colors.surfaceMuted, paddingHorizontal: 4, borderRadius: radius.xs }}
        >
          {segment.text}
        </AppText>
      );
    }
    if (segment.link !== undefined) {
      const target = safeHttpUrl(segment.link);
      return (
        <AppText
          key={index}
          variant="body"
          color={target !== null ? colors.primary : colors.textSecondary}
          onPress={
            target !== null
              ? () => {
                  void Linking.openURL(target).catch(() => undefined);
                }
              : undefined
          }
        >
          {segment.text}
        </AppText>
      );
    }
    return (
      <AppText
        key={index}
        variant="body"
        weight={segment.bold === true ? "700" : "400"}
        color={dimmed ? colors.textTertiary : colors.text}
        style={segment.italic === true ? styles.italic : undefined}
      >
        {segment.text}
      </AppText>
    );
  });

  return <View style={styles.inlineRow}>{nodes}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingLeft: space.xs,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
  },
  paragraph: {
    paddingVertical: 1,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: space.md,
    paddingVertical: 2,
  },
  code: {
    padding: space.md,
    borderRadius: radius.sm,
  },
  codeText: {
    fontSize: 13,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space.sm,
  },
  italic: {
    fontStyle: "italic",
  },
});

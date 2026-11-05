import type { ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { radius, space } from "../theme/tokens";
import { parseInline, parseMarkdown, safeHttpUrl } from "../lib/markdown";

/** 解析逻辑在 `lib/markdown.ts`（纯函数、可单测）；这里统一再导出，兼容旧引用 */
export * from "../lib/markdown";

/** 每层缩进的像素宽度（渲染用；与解析层的"每层 2 空格"分开，便于调视觉） */
const MD_INDENT_PX = 14;

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
              <View
                key={index}
                style={[styles.bulletRow, { paddingLeft: space.xs + block.depth * MD_INDENT_PX }]}
              >
                <AppText variant="body" tone="tertiary" lines={1}>
                  {block.depth === 0 ? "•" : "◦"}
                </AppText>
                <InlineText text={block.text} />
              </View>
            );
          case "ordered":
            return (
              <View
                key={index}
                style={[styles.bulletRow, { paddingLeft: space.xs + block.depth * MD_INDENT_PX }]}
              >
                <AppText variant="body" tone="tertiary" lines={1}>
                  {`${block.index}.`}
                </AppText>
                <InlineText text={block.text} />
              </View>
            );
          case "task":
            return (
              <View
                key={index}
                style={[styles.bulletRow, { paddingLeft: space.xs + block.depth * MD_INDENT_PX }]}
              >
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

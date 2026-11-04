import type { TextStyle } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { AppText, type TextTone } from "../theme/AppText";
import { type TypeVariant } from "../theme/tokens";

export interface HighlightSegment {
  value: string;
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 按 query 做大小写不敏感的切分（纯函数，空 query 返回整段）。
 * 例：splitHighlight("买牛奶和牛奶", "牛奶") →
 *   [{牛奶,true},{和,false},{牛奶,true}]
 */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const needle = query.trim();
  if (needle.length === 0 || text.length === 0) {
    return text.length === 0 ? [] : [{ value: text, match: false }];
  }
  const pattern = new RegExp(escapeRegExp(needle), "gi");
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const matched = match[0];
    if (matched.length === 0) continue;
    if (index > lastIndex) {
      segments.push({ value: text.slice(lastIndex, index), match: false });
    }
    segments.push({ value: matched, match: true });
    lastIndex = index + matched.length;
  }
  if (lastIndex < text.length) {
    segments.push({ value: text.slice(lastIndex), match: false });
  }
  return segments;
}

export interface HighlightProps {
  text: string;
  query: string;
  variant?: TypeVariant;
  tone?: TextTone;
  lines?: number;
  style?: TextStyle;
}

/**
 * 搜索高亮文本：只有命中段套 primaryMuted 背景并加粗，其余保持正文样式。
 * 必须经由 AppText 渲染（字号/行高锁定不破例）。
 */
export function Highlight({
  text,
  query,
  variant = "body",
  tone,
  lines = 1,
  style,
}: HighlightProps) {
  const colors = useTheme();
  const segments = splitHighlight(text, query);

  return (
    <AppText variant={variant} tone={tone} lines={lines} style={style}>
      {segments.map((segment, index) =>
        segment.match ? (
          <AppText
            key={index}
            variant={variant}
            weight="700"
            color={colors.text}
            lines={0}
            style={{ backgroundColor: colors.primaryMuted }}
          >
            {segment.value}
          </AppText>
        ) : (
          segment.value
        ),
      )}
    </AppText>
  );
}

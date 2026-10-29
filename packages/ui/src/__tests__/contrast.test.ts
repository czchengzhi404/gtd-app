import { describe, it, expect } from "bun:test";
import { darkColors, lightColors, type ThemeColors } from "../theme/tokens";

/**
 * WCAG 2.1 对比度审计（ui-ux-pro-max Accessibility CRITICAL：正文 ≥4.5:1）。
 * 用真实的主题 token 计算，避免"肉眼看着还行"的误判。
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** 相对亮度 */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 对比度（1–21） */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** 需要达到 4.5:1 的正文级组合 */
const BODY_PAIRS: { fg: keyof ThemeColors; bg: keyof ThemeColors }[] = [
  { fg: "text", bg: "canvas" },
  { fg: "text", bg: "surface" },
  { fg: "textSecondary", bg: "canvas" },
  { fg: "textSecondary", bg: "surface" },
  { fg: "onPrimary", bg: "primary" },
  { fg: "danger", bg: "canvas" },
  { fg: "success", bg: "canvas" },
  { fg: "warning", bg: "canvas" },
];

/** 弱化文本（caption/占位符）按 3:1 起（WCAG 对大字号/次要文本的宽松档） */
const MUTED_PAIRS: { fg: keyof ThemeColors; bg: keyof ThemeColors }[] = [
  { fg: "textTertiary", bg: "canvas" },
  { fg: "textTertiary", bg: "surface" },
  { fg: "textTertiary", bg: "surfaceMuted" },
];

for (const [name, theme] of [
  ["light", lightColors],
  ["dark", darkColors],
] as const) {
  describe(`${name} 主题对比度`, () => {
    for (const { fg, bg } of BODY_PAIRS) {
      it(`${fg} on ${bg} ≥ 4.5:1`, () => {
        const ratio = contrastRatio(theme[fg], theme[bg]);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }

    for (const { fg, bg } of MUTED_PAIRS) {
      it(`${fg} on ${bg} ≥ 3:1（次要文本）`, () => {
        const ratio = contrastRatio(theme[fg], theme[bg]);
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    }

    it("边框在底色上可辨识（≥1.3:1）", () => {
      expect(contrastRatio(theme.border, theme.surface)).toBeGreaterThanOrEqual(1.3);
      expect(contrastRatio(theme.borderStrong, theme.surface)).toBeGreaterThanOrEqual(1.5);
    });
  });
}

describe("对比度计算器自检", () => {
  it("纯黑与纯白为 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("同色为 1:1", () => {
    expect(contrastRatio("#2563EB", "#2563EB")).toBeCloseTo(1, 5);
  });

  it("顺序无关", () => {
    expect(contrastRatio("#FFFFFF", "#111111")).toBeCloseTo(
      contrastRatio("#111111", "#FFFFFF"),
      5,
    );
  });
});

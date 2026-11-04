import { describe, it, expect } from "bun:test";
import {
  alpha,
  withOpacity,
  type,
  space,
  radius,
  motion,
  motionEasing,
  breakpoint,
  zIndex,
  lightColors,
  darkColors,
  compatColors,
  type ThemeColors,
  type TypeVariant,
} from "../theme/tokens";

/**
 * v2 tokens 单测：颜色工具、语义色对比度、字号阶梯单调性。
 * 对比度计算器与 contrast.test.ts 同款 WCAG 2.1 公式（此处独立实现，
 * 避免 import 测试文件导致重复注册用例）。
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

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

describe("alpha()", () => {
  it("把 6 位 hex 转成 rgba", () => {
    expect(alpha("#2563EB", 0.5)).toBe("rgba(37, 99, 235, 0.5)");
  });

  it("支持 3 位简写", () => {
    expect(alpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
    expect(alpha("#000", 0.25)).toBe("rgba(0, 0, 0, 0.25)");
  });

  it("透明度收敛到 0–1 并保留 3 位小数", () => {
    expect(alpha("#123456", 1.5)).toBe("rgba(18, 52, 86, 1)");
    expect(alpha("#123456", -1)).toBe("rgba(18, 52, 86, 0)");
    expect(alpha("#123456", 0.1234)).toBe("rgba(18, 52, 86, 0.123)");
  });

  it("非 hex 输入原样返回（不抛错）", () => {
    expect(alpha("rgba(0,0,0,0.5)", 0.2)).toBe("rgba(0,0,0,0.5)");
    expect(alpha("transparent", 0.5)).toBe("transparent");
  });

  it("8 位 hex 的内嵌 alpha 与外传 a 相乘", () => {
    expect(alpha("#00000080", 1)).toBe("rgba(0, 0, 0, 0.502)");
    expect(alpha("#000000FF", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("withOpacity 对 ThemeColors 键做类型安全的取值", () => {
    expect(withOpacity(lightColors, "primary", 0.12)).toBe(alpha(lightColors.primary, 0.12));
    expect(withOpacity(darkColors, "surface", 0)).toBe(alpha(darkColors.surface, 0));
  });
});

const NEW_SEMANTIC_KEYS: (keyof ThemeColors)[] = [
  "info",
  "infoMuted",
  "focusRing",
  "scrim",
  "successMuted",
  "warningMuted",
  "neutralMuted",
  "surfaceOverlay",
  "textOnAccent",
];

describe("v2 语义色 token", () => {
  it("亮/暗主题拥有完全相同的键集合", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("新增语义位在两套主题都存在", () => {
    for (const key of NEW_SEMANTIC_KEYS) {
      expect(typeof lightColors[key]).toBe("string");
      expect(typeof darkColors[key]).toBe("string");
    }
  });

  for (const [name, theme] of [
    ["light", lightColors],
    ["dark", darkColors],
  ] as const) {
    it(`${name}: info 在 canvas/surface 上 ≥ 4.5:1`, () => {
      expect(contrastRatio(theme.info, theme.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.info, theme.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: textOnAccent 在 primary/danger 上 ≥ 4.5:1`, () => {
      expect(contrastRatio(theme.textOnAccent, theme.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.textOnAccent, theme.danger)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: 语义色在各自 muted 底上 ≥ 4.5:1`, () => {
      expect(contrastRatio(theme.info, theme.infoMuted)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.success, theme.successMuted)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.warning, theme.warningMuted)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.danger, theme.dangerMuted)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: 正文在 neutralMuted / surfaceOverlay 上 ≥ 4.5:1`, () => {
      expect(contrastRatio(theme.text, theme.neutralMuted)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.text, theme.surfaceOverlay)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: focusRing 在 surface 上 ≥ 3:1（非文本对比）`, () => {
      expect(contrastRatio(theme.focusRing, theme.surface)).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: 画布明度符合主题基调`, () => {
      if (name === "dark") {
        expect(luminance(theme.canvas)).toBeLessThan(0.05);
      } else {
        expect(luminance(theme.canvas)).toBeGreaterThan(0.8);
      }
    });
  }

  it("compatColors 保留 bg 别名且指向 canvas", () => {
    expect(compatColors(lightColors).bg).toBe(lightColors.canvas);
    expect(compatColors(darkColors).bg).toBe(darkColors.canvas);
  });
});

/** 从大到小的阅读阶梯（bodyStrong 与 body 同字号，故允许相等） */
const LADDER: TypeVariant[] = [
  "hero",
  "display",
  "title",
  "subtitle",
  "body",
  "bodyStrong",
  "label",
  "caption",
];

describe("type 阶梯", () => {
  it("v2 新变体存在", () => {
    for (const variant of ["hero", "subtitle"] as const) {
      expect(type[variant]).toBeDefined();
      expect(type[variant].fontSize).toBeGreaterThan(0);
    }
  });

  it("既有变体保持导出（向后兼容）", () => {
    for (const variant of ["display", "title", "body", "bodyStrong", "label", "caption", "mono"] as const) {
      expect(type[variant]).toBeDefined();
      expect(type[variant].lineHeight).toBeGreaterThan(0);
    }
  });

  it("字号从 hero 到 caption 单调不增，且仅 body/bodyStrong 相等", () => {
    for (let i = 1; i < LADDER.length; i += 1) {
      const prev = type[LADDER[i - 1] as TypeVariant];
      const next = type[LADDER[i] as TypeVariant];
      expect(prev.fontSize).toBeGreaterThanOrEqual(next.fontSize);
    }
    expect(type.hero.fontSize).toBeGreaterThan(type.display.fontSize);
    expect(type.display.fontSize).toBeGreaterThan(type.title.fontSize);
    expect(type.title.fontSize).toBeGreaterThan(type.subtitle.fontSize);
    expect(type.subtitle.fontSize).toBeGreaterThan(type.body.fontSize);
    expect(type.body.fontSize).toBe(type.bodyStrong.fontSize);
    expect(type.label.fontSize).toBeGreaterThan(type.caption.fontSize);
  });

  it("行高随字号单调不增，且每个变体行高 ≥ 字号 × 1.25（可读性）", () => {
    for (let i = 1; i < LADDER.length; i += 1) {
      const prev = type[LADDER[i - 1] as TypeVariant];
      const next = type[LADDER[i] as TypeVariant];
      expect(prev.lineHeight).toBeGreaterThanOrEqual(next.lineHeight);
    }
    for (const variant of Object.keys(type) as TypeVariant[]) {
      const scale = type[variant];
      expect(scale.lineHeight).toBeGreaterThanOrEqual(Math.ceil(scale.fontSize * 1.25));
    }
  });

  it("正文行高为 24（v2 可读性优先）", () => {
    expect(type.body.lineHeight).toBe(24);
    expect(type.bodyStrong.lineHeight).toBe(24);
  });
});

describe("v2 新增 token 表", () => {
  it("间距保持 4/8 栅格并新增 huge", () => {
    expect(space.xxs).toBe(2);
    expect(space.xs).toBe(4);
    expect(space.sm).toBe(8);
    expect(space.md).toBe(12);
    expect(space.lg).toBe(16);
    expect(space.xl).toBe(20);
    expect(space.xxl).toBe(24);
    expect(space.xxxl).toBe(32);
    expect(space.huge).toBe(40);
  });

  it("圆角新增 xl", () => {
    expect(radius.xs).toBe(6);
    expect(radius.sm).toBe(10);
    expect(radius.md).toBe(14);
    expect(radius.lg).toBe(20);
    expect(radius.xl).toBe(24);
    expect(radius.pill).toBe(999);
  });

  it("断点/层级/缓动表", () => {
    expect(breakpoint).toEqual({ compact: 0, medium: 768, wide: 1024, ultra: 1440 });
    expect(zIndex).toEqual({ base: 0, sticky: 10, overlay: 100, modal: 200, toast: 300 });
    expect(motionEasing.standard).toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(motionEasing.emphasized).toBe("cubic-bezier(0.3, 0, 0, 1)");
    expect(motion.fast).toBe(120);
    expect(motion.base).toBe(200);
    expect(motion.slow).toBe(320);
    expect(motion.fast).toBeLessThan(motion.base);
    expect(motion.base).toBeLessThan(motion.slow);
  });
});

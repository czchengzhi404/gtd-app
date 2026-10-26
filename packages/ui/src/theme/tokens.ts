/**
 * 设计系统 token（v0.3.0 重构）。
 * 纪律：组件只消费 token，不写字面量尺寸/颜色/字号。
 * 尺寸单位为逻辑像素；REM/百分比禁止用于行高与字号（避免随系统缩放漂移）。
 */

/** 8pt 栅格 + 4pt 半格 */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/**
 * 字号阶梯。每个 variant 固定 size/lineHeight/weight——
 * 与 AppText 绑定，任何文本都不会超出其容器计算高度。
 */
export const type = {
  display: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "500" },
  mono: { fontSize: 14, lineHeight: 21, fontWeight: "400" },
} as const;

export type TypeVariant = keyof typeof type;

/** 固定行高（列表/工具栏）：与字号无关，杜绝文字撑高布局 */
export const hit = {
  /** 最小触控目标（iOS 44 / Material 48 的折中上限） */
  min: 44,
  /** 列表行 */
  row: 56,
  /** 导航栏条目 */
  nav: 48,
  /** 主按钮 */
  button: 46,
  /** 小按钮 */
  buttonSm: 36,
  /** 底部 Tab 栏 */
  tabBar: 62,
  /** 顶部工具栏 */
  toolbar: 52,
} as const;

export const elevation = {
  none: {},
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  float: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

/** 动效：200–300ms，尊重系统“减弱动态效果”由调用方判断 */
export const motion = { fast: 140, base: 220, slow: 300 } as const;

/* ---------------- 颜色（语义 token，亮/暗双套，对比度 ≥4.5:1） ---------------- */

export const lightColors = {
  /** 页面底色（略暖的浅灰，让白色卡片浮起来） */
  canvas: "#F5F6F8",
  /** 卡片/浮层底色 */
  surface: "#FFFFFF",
  /** 次级表面（输入框、分段控件底） */
  surfaceMuted: "#EEF0F4",
  text: "#16191D",
  textSecondary: "#5C636E",
  textTertiary: "#8A9099",
  primary: "#2563EB",
  primaryMuted: "#E8EFFE",
  onPrimary: "#FFFFFF",
  border: "#E2E5EA",
  borderStrong: "#CBD0D8",
  danger: "#C81E1E",
  dangerMuted: "#FDECEC",
  success: "#0F7B4F",
  warning: "#B45309",
  overlay: "rgba(16,19,23,0.35)",
} as const;

export const darkColors = {
  canvas: "#101215",
  surface: "#191C21",
  surfaceMuted: "#22262D",
  text: "#F3F5F8",
  textSecondary: "#A7AEB8",
  textTertiary: "#767D88",
  primary: "#7EA6F8",
  primaryMuted: "#1C2A45",
  onPrimary: "#0B1526",
  border: "#2A2F37",
  borderStrong: "#3A4049",
  danger: "#F87171",
  dangerMuted: "#3A1D1D",
  success: "#4ADE80",
  warning: "#FBBF24",
  overlay: "rgba(0,0,0,0.55)",
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

/** 兼容旧引用（部分组件/外部仍按 bg 命名取色） */
export function compatColors(c: ThemeColors) {
  return { ...c, bg: c.canvas };
}

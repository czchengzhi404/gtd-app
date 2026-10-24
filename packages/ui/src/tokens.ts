/**
 * 设计 token（ui-ux-pro-max：Typography & Color MEDIUM、Animation MEDIUM）。
 * 组件一律消费语义 token，禁止裸色值/裸数值散落。
 */

/** 4pt/8dp 增量间距系统 */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

/** 图标尺寸 token（同一视觉层用同一档） */
export const iconSize = { sm: 18, md: 24, lg: 32 } as const;

/** 动效时长：200–300ms 平滑过渡；尊重系统 reduced-motion（组件侧判断） */
export const duration = { fast: 150, base: 220, slow: 280 } as const;

/** 触控目标下限（ui-ux-pro-max Touch CRITICAL：≥44×44px） */
export const minTouchTarget = 44;

/** 正文对比度 ≥4.5:1（亮暗两套均已按此校准） */
export const lightColors = {
  bg: "#FFFFFF",
  surface: "#F4F6F8",
  text: "#1A1D21",
  textSecondary: "#5A6169",
  primary: "#2563EB",
  onPrimary: "#FFFFFF",
  border: "#DDE2E8",
  danger: "#B91C1C",
  success: "#047857",
} as const;

export const darkColors = {
  bg: "#121417",
  surface: "#1C2024",
  text: "#F2F4F7",
  textSecondary: "#A8B0BA",
  primary: "#7CA8F5",
  onPrimary: "#0B1B3A",
  border: "#2C3138",
  danger: "#F87171",
  success: "#4ADE80",
} as const;

/** 语义色类型：值放宽为 string，便于亮暗两套常量同型互换 */
export type ThemeColors = { [K in keyof typeof lightColors]: string };

import { useWindowDimensions } from "react-native";

/**
 * 断点方案（ui-ux-pro-max §5 Layout & Responsive，预设 375/768/1024/1440）：
 * <375 xs；≥375 sm；≥768 md（侧栏）；≥1024 lg（双栏）；≥1440 xl（Timeline 可用）。
 * 移动优先：组件默认按 xs 布局，再用断点向上增强。
 */
export const BREAKPOINTS = { sm: 375, md: 768, lg: 1024, xl: 1440 } as const;

export type BreakpointName = "xs" | "sm" | "md" | "lg" | "xl";

export function getBreakpoint(width: number): BreakpointName {
  if (width >= BREAKPOINTS.xl) return "xl";
  if (width >= BREAKPOINTS.lg) return "lg";
  if (width >= BREAKPOINTS.md) return "md";
  if (width >= BREAKPOINTS.sm) return "sm";
  return "xs";
}

export interface BreakpointInfo {
  name: BreakpointName;
  width: number;
  /** ≥768：侧栏布局 */
  isTabletUp: boolean;
  /** ≥1024：侧栏 + 列表/详情双栏 */
  isDesktopUp: boolean;
  /** ≥1440：只读 Timeline 可选 */
  isWideUp: boolean;
}

export function useBreakpoint(): BreakpointInfo {
  const { width } = useWindowDimensions();
  return {
    name: getBreakpoint(width),
    width,
    isTabletUp: width >= BREAKPOINTS.md,
    isDesktopUp: width >= BREAKPOINTS.lg,
    isWideUp: width >= BREAKPOINTS.xl,
  };
}

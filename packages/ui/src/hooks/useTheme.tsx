import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "../theme/tokens";
import { useAppStore } from "./useAppStore";

/** 兼容字段：旧组件按 bg 取页面底色 */
export type AppThemeColors = ThemeColors & { bg: string };

/** 主题模式 */
export type ThemeMode = "system" | "light" | "dark";
/** 字体族 */
export type FontFamily = "LXGWWenKai" | "system";

export const BUILTIN_FONT = "LXGWWenKai";

function withLegacyAlias(c: ThemeColors): AppThemeColors {
  return { ...c, bg: c.canvas };
}

const ThemeColorsContext = createContext<AppThemeColors>(withLegacyAlias(lightColors));
const ThemeSettingsContext = createContext<{ mode: ThemeMode; fontFamily: FontFamily }>({
  mode: "system",
  fontFamily: "system",
});

export interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * 主题提供者：日夜模式（跟随系统/手动切换）+ 字体族（霞鹜文楷/系统默认）。
 * 设置从 kv 读取（持久化），通过 useAppStore 实现响应式——
 * 设置页修改 kv 后全 app 即时生效，无需重启。
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const system = useColorScheme();
  const themeMode = useAppStore((s) => s.kv["theme.mode"] as ThemeMode | undefined);
  const fontPref = useAppStore((s) => s.kv["font.family"] as FontFamily | undefined);

  const mode: ThemeMode = themeMode ?? "system";
  // 默认系统字体（内置霞鹜文楷为可选项，选中时才懒加载）
  const fontFamily: FontFamily = fontPref ?? "system";

  const isDark = mode === "dark" || (mode === "system" && system === "dark");
  const colors = withLegacyAlias(isDark ? darkColors : lightColors);

  return (
    <ThemeSettingsContext.Provider value={{ mode, fontFamily }}>
      <ThemeColorsContext.Provider value={colors}>{children}</ThemeColorsContext.Provider>
    </ThemeSettingsContext.Provider>
  );
}

/** 当前主题设置（模式 + 字体族） */
export function useThemeSettings(): { mode: ThemeMode; fontFamily: FontFamily } {
  return useContext(ThemeSettingsContext);
}

export function useTheme(): AppThemeColors {
  return useContext(ThemeColorsContext);
}

/** 获取当前生效的 fontFamily（供 AppText 使用） */
export function useResolvedFontFamily(): string | undefined {
  const { fontFamily } = useContext(ThemeSettingsContext);
  return fontFamily === BUILTIN_FONT ? BUILTIN_FONT : undefined;
}

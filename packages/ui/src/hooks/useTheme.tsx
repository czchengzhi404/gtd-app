import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "../theme/tokens";

/** 兼容字段：旧组件按 bg 取页面底色 */
export type AppThemeColors = ThemeColors & { bg: string };

function withLegacyAlias(c: ThemeColors): AppThemeColors {
  return { ...c, bg: c.canvas };
}

const ThemeContext = createContext<AppThemeColors>(withLegacyAlias(lightColors));

interface ThemeProviderProps {
  /** 显式传入时优先（桌面壳可固定主题）；否则跟随系统 */
  scheme?: ColorSchemeName;
  children: ReactNode;
}

export function ThemeProvider({ scheme, children }: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved = (scheme ?? system) === "dark" ? darkColors : lightColors;
  return (
    <ThemeContext.Provider value={withLegacyAlias(resolved)}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppThemeColors {
  return useContext(ThemeContext);
}

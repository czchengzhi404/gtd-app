import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "../tokens";

const ThemeContext = createContext<ThemeColors>(lightColors);

interface ThemeProviderProps {
  /** 显式传入时优先（桌面壳可固定主题）；否则跟随系统 */
  scheme?: ColorSchemeName;
  children: ReactNode;
}

export function ThemeProvider({ scheme, children }: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved = (scheme ?? system) === "dark" ? darkColors : lightColors;
  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}

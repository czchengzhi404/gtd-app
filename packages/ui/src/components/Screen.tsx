import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../hooks/useTheme";

/** 页面容器：背景语义 token，flex 填充（禁止固定像素宽度，响应式由父级断点决定） */
export function Screen({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return <View style={[styles.screen, { backgroundColor: colors.bg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});

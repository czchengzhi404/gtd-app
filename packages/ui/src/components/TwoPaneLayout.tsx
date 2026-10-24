import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useBreakpoint } from "../hooks/useBreakpoint";

export interface TwoPaneLayoutProps {
  list: ReactNode;
  /** 详情 pane；detailVisible=false 时（窄屏）不渲染 */
  detail?: ReactNode;
  detailVisible: boolean;
}

/**
 * 列表/详情双栏（≥1024 启用）。窄屏时只渲染 list（详情由路由全屏承载）。
 * 无固定像素容器宽度：列表 pane 用 flex + maxContentWidth 语义，由父级决定。
 */
export function TwoPaneLayout({ list, detail, detailVisible }: TwoPaneLayoutProps) {
  const { isDesktopUp } = useBreakpoint();
  const showDetail = isDesktopUp && detailVisible && detail !== undefined;
  return (
    <View style={styles.wrap}>
      <View style={showDetail ? styles.listPane : styles.fullPane}>{list}</View>
      {showDetail ? <View style={styles.divider} /> : null}
      {showDetail ? <View style={styles.detailPane}>{detail}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: "row",
  },
  listPane: {
    flex: 1,
    maxWidth: 480,
  },
  fullPane: {
    flex: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#88888855",
  },
  detailPane: {
    flex: 1.4,
  },
});

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useTheme } from "../hooks/useTheme";

export interface TwoPaneLayoutProps {
  list: ReactNode;
  /** 详情 pane；窄屏或未选中时不渲染 */
  detail?: ReactNode;
  detailVisible: boolean;
}

/**
 * 列表 / 详情双栏（≥1024 启用）。
 * 列表栏宽度上限 460，详情栏 flex 占满剩余——无固定像素页宽，窗口缩放自然重排。
 */
export function TwoPaneLayout({ list, detail, detailVisible }: TwoPaneLayoutProps) {
  const { isDesktopUp } = useBreakpoint();
  const colors = useTheme();
  const showDetail = isDesktopUp && detailVisible && detail !== undefined;

  return (
    <View style={styles.wrap}>
      <View style={showDetail ? styles.listPane : styles.fullPane}>{list}</View>
      {showDetail ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.detailPane}>{detail}</View>
        </>
      ) : null}
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
    maxWidth: 460,
  },
  fullPane: {
    flex: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  detailPane: {
    flex: 1.5,
    minWidth: 0,
  },
});

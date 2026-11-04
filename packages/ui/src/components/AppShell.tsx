import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { breakpoint, space } from "../theme/tokens";

export interface AppShellProps {
  /** 左侧导航（≥768 显示） */
  sidebar?: ReactNode;
  children: ReactNode;
  /** 右侧详情（≥1180 且提供时显示第三栏） */
  detail?: ReactNode;
  sidebarWidth?: number;
}

/** 详情栏宽度（固定 400；拖拽调宽留待后续版本） */
const DETAIL_WIDTH = 400;
/** 三栏断点：≥1180 才放得下 232 侧栏 + 880 内容 + 400 详情 */
const DETAIL_BREAKPOINT = 1180;

/**
 * 响应式应用外壳。
 *
 * - <768：只渲染 children（底部 AppTabBar 由页面负责）
 * - ≥768：侧栏 + 主内容（内容轨道 max 880 居中）
 * - ≥1180 且传了 detail：三栏（侧栏 / 列表 / 详情 400）
 *
 * 断点监听统一走 useBreakpoint，组件内不自建 resize 监听。
 */
export function AppShell({ sidebar, children, detail, sidebarWidth = 232 }: AppShellProps) {
  const colors = useTheme();
  const bp = useBreakpoint();

  if (bp.width < breakpoint.medium) {
    return <View style={[styles.fill, { backgroundColor: colors.canvas }]}>{children}</View>;
  }

  const showSidebar = sidebar !== undefined;
  const showDetail = detail !== undefined && bp.width >= DETAIL_BREAKPOINT;

  return (
    <View style={[styles.row, { backgroundColor: colors.canvas }]}>
      {showSidebar ? (
        <View
          style={[
            styles.sidebar,
            { width: sidebarWidth, borderRightColor: colors.border },
          ]}
        >
          {sidebar}
        </View>
      ) : null}
      <View style={styles.main}>
        <View style={styles.track}>{children}</View>
      </View>
      {showDetail ? (
        <View style={[styles.detail, { borderLeftColor: colors.border }]}>{detail}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  track: {
    flex: 1,
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
  },
  detail: {
    width: DETAIL_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: space.xs,
  },
});

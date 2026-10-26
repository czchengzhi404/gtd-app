import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { hit, radius, space } from "../theme/tokens";
import { IconButton } from "../theme/primitives";

/** 页面容器：统一 canvas 底色 + 横向安全内边距交给子组件 */
export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const colors = useTheme();
  return <View style={[styles.screen, { backgroundColor: colors.canvas }, style]}>{children}</View>;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 右侧操作区 */
  actions?: ReactNode;
  /** 左侧返回（详情页） */
  onBack?: () => void;
  backLabel?: string;
}

/** 页面标题栏：固定高度，标题单行省略，不会因为长标题挤走操作区 */
export function PageHeader({ title, subtitle, actions, onBack, backLabel }: PageHeaderProps) {
  const colors = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerLeft}>
        {onBack !== undefined ? (
          <IconButton
            icon="chevron-back"
            onPress={onBack}
            accessibilityLabel={backLabel ?? "返回"}
            size={22}
          />
        ) : null}
        <View style={styles.titleBlock}>
          <AppText variant="title" lines={1}>
            {title}
          </AppText>
          {subtitle !== undefined ? (
            <AppText variant="caption" tone="tertiary" lines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {actions !== undefined ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
  );
}

/** 列表分组标题：小号大写字 + 右侧计数/操作 */
export function SectionHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <View style={styles.section}>
      <AppText variant="caption" tone="tertiary" lines={1} style={styles.sectionLabel}>
        {title}
      </AppText>
      {trailing}
    </View>
  );
}

/** 分段控件容器（视图切换器/筛选器共用外观） */
export function SegmentedWrap({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    minHeight: hit.toolbar,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flex: 1,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 0,
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  sectionLabel: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.sm,
    padding: 3,
    alignSelf: "flex-start",
  },
});

import type { ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AppText } from "../theme/AppText";
import { IconButton } from "../theme/primitives";
import { breakpoint, elevation, radius, space } from "../theme/tokens";
import { t } from "../i18n";

export interface SheetProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** 底部操作区（通常放 Button） */
  actions?: ReactNode;
}

/**
 * 底部抽屉容器。
 *
 * - 手机/平板竖屏：全宽贴底，顶部圆角 + grabber
 * - web 宽屏（≥768）：居中对话框（max-width 480），遮罩点击关闭
 * - 遮罩点击关闭；内容标记 accessibilityViewIsModal（iOS 读屏只聚焦本层）
 */
export function Sheet({ visible, title, onClose, children, actions }: SheetProps) {
  const colors = useTheme();
  const bp = useBreakpoint();
  const reduced = useReducedMotion();
  const isDialog = Platform.OS === "web" && bp.width >= breakpoint.medium;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("v2.sheet.close")}
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
      />
      <View
        style={isDialog ? styles.dialogPosition : styles.sheetPosition}
        pointerEvents="box-none"
      >
        <View
          role="dialog"
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            isDialog ? styles.dialog : styles.sheet,
            elevation.float,
            {
              backgroundColor: colors.surfaceOverlay,
              borderColor: colors.border,
            },
          ]}
        >
          {isDialog ? null : (
            <View style={styles.grabberWrap}>
              <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
            </View>
          )}
          {title !== undefined ? (
            <View style={styles.titleRow}>
              <AppText variant="title" lines={2} style={styles.title}>
                {title}
              </AppText>
              <IconButton
                icon="close"
                onPress={onClose}
                accessibilityLabel={t("v2.sheet.close")}
              />
            </View>
          ) : (
            <View style={styles.closeOnly}>
              <IconButton
                icon="close"
                onPress={onClose}
                accessibilityLabel={t("v2.sheet.close")}
              />
            </View>
          )}
          <View style={styles.body}>{children}</View>
          {actions !== undefined ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheetPosition: {
    flex: 1,
    justifyContent: "flex-end",
  },
  dialogPosition: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  sheet: {
    width: "100%",
    maxHeight: "88%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingBottom: space.xxl,
  },
  dialog: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "82%",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: space.lg,
  },
  grabberWrap: {
    alignItems: "center",
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  closeOnly: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingRight: space.xs,
    paddingTop: space.xs,
  },
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    gap: space.md,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
});

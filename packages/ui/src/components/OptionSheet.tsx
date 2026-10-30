import { Modal, Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { t } from "../i18n";
import { hit, radius, space } from "../theme/tokens";

export interface OptionSheetOption {
  key: string;
  label: string;
  danger?: boolean;
}

export interface OptionSheetProps {
  visible: boolean;
  title?: string;
  options: OptionSheetOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

/**
 * 通用选项面板（底部弹出）。
 *
 * 用途：批量移动状态等"选一个就执行"的场景。
 * 用 Modal 而不是 Alert：RNW 未实现 Alert.alert（web/桌面会静默失效），
 * 而 Modal 三端一致；选项高度 ≥ hit.nav，符合触控目标要求。
 */
export function OptionSheet({ visible, title, options, onSelect, onClose }: OptionSheetProps) {
  const colors = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.closeMenu")}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
      <View style={styles.sheetPos} pointerEvents="box-none">
        <View
          accessibilityRole="menu"
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.grabberWrap}>
            <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          </View>
          {title !== undefined ? (
            <View style={styles.titleRow}>
              <AppText variant="label" tone="secondary" lines={2}>
                {title}
              </AppText>
            </View>
          ) : null}
          {options.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="menuitem"
              accessibilityLabel={option.label}
              onPress={() => onSelect(option.key)}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: pressed ? colors.surfaceMuted : "transparent" },
              ]}
            >
              <AppText
                variant="body"
                color={option.danger === true ? colors.danger : colors.text}
                lines={1}
              >
                {option.label}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={onClose}
            style={({ pressed }) => [
              styles.item,
              styles.cancelItem,
              {
                backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                borderTopColor: colors.border,
              },
            ]}
          >
            <AppText variant="body" tone="secondary" lines={1}>
              {t("common.cancel")}
            </AppText>
          </Pressable>
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
  sheetPos: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingBottom: space.xl,
  },
  grabberWrap: {
    alignItems: "center",
    paddingVertical: space.sm,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  item: {
    minHeight: hit.nav,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  cancelItem: {
    marginTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
  },
});

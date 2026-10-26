import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { IconButton } from "../theme/primitives";
import { hit, radius, space } from "../theme/tokens";
import { t } from "../i18n";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface ActionItem {
  key: string;
  label: string;
  icon?: IoniconName;
  danger?: boolean;
  onSelect: () => void;
}

export interface RowActionsProps {
  actions: ActionItem[];
  accessibilityLabel?: string;
}

/**
 * 行尾操作入口（⋯）→ 底部动作面板。
 * 用 Modal 承载而非绝对定位浮层：不会与相邻行重叠、不依赖 zIndex、
 * 自带遮罩点击关闭，且天然适配安全区。
 */
export function RowActions({ actions, accessibilityLabel }: RowActionsProps) {
  const colors = useTheme();
  const [open, setOpen] = useState(false);

  const run = (action: ActionItem) => {
    setOpen(false);
    // 等面板关闭后再执行，避免与卸载竞争
    setTimeout(action.onSelect, 60);
  };

  return (
    <>
      <IconButton
        icon="ellipsis-horizontal"
        onPress={() => setOpen(true)}
        accessibilityLabel={accessibilityLabel ?? t("common.moreActions")}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.closeMenu")}
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setOpen(false)}
        />
        <View style={styles.sheetPos} pointerEvents="box-none">
          <View
            accessibilityRole="menu"
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.grabberWrap}>
              <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
            </View>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                accessibilityRole="menuitem"
                accessibilityLabel={action.label}
                onPress={() => run(action)}
                style={({ pressed }) => [
                  styles.item,
                  { backgroundColor: pressed ? colors.surfaceMuted : "transparent" },
                ]}
              >
                {action.icon !== undefined ? (
                  <Ionicons
                    name={action.icon}
                    size={19}
                    color={action.danger === true ? colors.danger : colors.textSecondary}
                  />
                ) : null}
                <AppText
                  variant="body"
                  color={action.danger === true ? colors.danger : colors.text}
                  lines={1}
                >
                  {action.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
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
  item: {
    minHeight: hit.nav,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
});

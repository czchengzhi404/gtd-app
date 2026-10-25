import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import { useFocusStyle } from "../hooks/useFocusStyle";
import { minTouchTarget, radius, spacing } from "../tokens";

export interface ActionItem {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

export interface RowActionsProps {
  actions: ActionItem[];
  accessibilityLabel: string;
}

/**
 * 行尾"更多操作"按钮（⋯）：点击弹出内联操作面板（删除/编辑等）。
 * 面板出现在按钮下方；点击面板外任意处关闭。触控目标 ≥44px。
 */
export function RowActions({ actions, accessibilityLabel }: RowActionsProps) {
  const colors = useTheme();
  const focus = useFocusStyle(radius.sm);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<View>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // web: 点击面板外关闭；native 由遮罩层承担
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("mousedown", close);
      return () => document.removeEventListener("mousedown", close);
    }
    return undefined;
  }, [open]);

  return (
    <View ref={wrapRef} style={styles.wrap} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        hitSlop={4}
        style={({ pressed }) => [
          styles.trigger,
          focus,
          { backgroundColor: open ? colors.surface : "transparent", opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text maxFontSizeMultiplier={1.2} style={{ color: colors.textSecondary, fontSize: 20, lineHeight: 24 }}>⋯</Text>
      </Pressable>
      {open ? (
        <>
          <Pressable
            accessibilityLabel={t("common.closeMenu")}
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View
            accessibilityRole="menu"
            style={[styles.panel, { backgroundColor: colors.bg, borderColor: colors.border }]}
          >
            {actions.map((action) => (
              <Pressable
                key={action.key}
                accessibilityRole="menuitem"
                accessibilityLabel={action.label}
                onPress={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                style={({ pressed }) => [
                  styles.item,
                  focus,
                  { backgroundColor: pressed ? colors.surface : "transparent" },
                ]}
              >
                <Text maxFontSizeMultiplier={1.2}
                  style={{
                    color: action.danger === true ? colors.danger : colors.text,
                    fontSize: 15,
                  }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  trigger: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    position: "absolute",
    top: minTouchTarget,
    right: 0,
    minWidth: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    // 轻微抬升
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  item: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
});

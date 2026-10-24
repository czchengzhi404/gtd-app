import { Platform, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./useTheme";

/**
 * web 焦点环（ui-ux-pro-max Accessibility：键盘焦点可见）。
 * RNW 支持 ':focus' 伪类样式；native 无此概念，返回空。
 */
export function useFocusStyle(radiusValue = 8): StyleProp<ViewStyle> {
  const colors = useTheme();
  if (Platform.OS !== "web") {
    return {};
  }
  return {
    ":focus": {
      outlineStyle: "solid",
      outlineWidth: 2,
      outlineColor: colors.primary,
      outlineOffset: 2,
      borderRadius: radiusValue,
    },
  } as StyleProp<ViewStyle>;
}

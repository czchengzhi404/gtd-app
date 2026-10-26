import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { type as typeScale, type TypeVariant } from "./tokens";

export type TextTone = "primary" | "secondary" | "tertiary" | "accent" | "danger" | "success" | "warning" | "onPrimary";

export interface AppTextProps extends Omit<TextProps, "style" | "allowFontScaling"> {
  /** 字号阶梯（决定 size/lineHeight/weight） */
  variant?: TypeVariant;
  /** 语义颜色；不传则用正文色 */
  tone?: TextTone;
  /** 覆盖颜色（仅用于品牌色等 token 外的确有必要处） */
  color?: string;
  /** 默认单行省略；显式传 2/3 用于标题 */
  lines?: number;
  weight?: TextStyle["fontWeight"];
  align?: TextStyle["textAlign"];
  style?: TextStyle;
}

/**
 * 唯一的文本原语。
 *
 * 三重锁定（这是手机端“文字撑爆布局”的根治手段）：
 * 1. allowFontScaling={false} —— 不随系统字体大小缩放
 * 2. maxFontSizeMultiplier={1} —— 双保险（部分 ROM 只认这个）
 * 3. 字号/行高来自固定阶梯 —— 容器高度可预测
 * 4. 默认 numberOfLines=1 + 省略号 —— 长文本不会挤占相邻元素
 *
 * 全应用禁止直接使用 react-native 的 <Text>。
 */
export function AppText({
  variant = "body",
  tone,
  color,
  lines = 1,
  weight,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const colors = useTheme();
  const scale = typeScale[variant];

  const toneColor: Record<TextTone, string> = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.primary,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    onPrimary: colors.onPrimary,
  };

  return (
    <Text
      {...rest}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      numberOfLines={lines}
      ellipsizeMode="tail"
      style={[
        {
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          fontWeight: weight ?? scale.fontWeight,
          color: color ?? (tone !== undefined ? toneColor[tone] : colors.text),
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

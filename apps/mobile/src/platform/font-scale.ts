import { Platform, Text, TextInput } from "react-native";

/**
 * 全局字体缩放禁用（Android 真机大字体/显示缩放导致文字撑爆布局的根治方案）：
 * 拦截全部 Text/TextInput 的渲染，强制 allowFontScaling=false——覆盖包括
 * react-navigation 等第三方组件在内的所有文本，无视系统 fontScale。
 * 新架构（Fabric）下 Text.render 拦截依然有效；web 端无 fontScale 概念跳过。
 */
export function installFontScaleOverride(): void {
  if (Platform.OS === "web") return;

  const TextAny = Text as unknown as {
    render: (props: Record<string, unknown>, ref: unknown) => unknown;
  };
  if (typeof TextAny.render === "function") {
    const original = TextAny.render.bind(TextAny);
    TextAny.render = (props, ref) =>
      original({ allowFontScaling: false, ...props }, ref);
  }

  const InputAny = TextInput as unknown as { defaultProps?: Record<string, unknown> };
  InputAny.defaultProps = {
    ...(InputAny.defaultProps ?? {}),
    allowFontScaling: false,
  };
}

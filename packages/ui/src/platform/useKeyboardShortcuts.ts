import { useEffect } from "react";

/**
 * 快捷键 hook 的原生基线实现：no-op。
 * 快捷键是桌面增强（ui-ux-pro-max：不依赖 hover/键盘作为移动端唯一交互）。
 * 平台差异文件：useKeyboardShortcuts.web.ts（window keydown 监听）。
 */
export interface ShortcutSpec {
  key: string;
  modifier?: "ctrl" | "shift" | "alt" | "meta";
}

export function useKeyboardShortcuts(
  _shortcuts: ShortcutSpec[],
  _handler: (key: string) => void,
): void {
  useEffect(() => {});
}

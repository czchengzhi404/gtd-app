import { useEffect } from "react";

/**
 * web/桌面实现：window keydown 监听。仅桌面增强使用；移动端走同路径的
 * .ts 基线 no-op 实现。
 */
export interface ShortcutSpec {
  key: string;
  modifier?: "ctrl" | "shift" | "alt" | "meta";
}

export function useKeyboardShortcuts(
  shortcuts: ShortcutSpec[],
  handler: (key: string) => void,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const held = { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
      const match = shortcuts.find(
        (s) =>
          e.key.toLowerCase() === s.key.toLowerCase() &&
          (!s.modifier || held[s.modifier]),
      );
      if (match) {
        e.preventDefault();
        handler(match.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, handler]);
}

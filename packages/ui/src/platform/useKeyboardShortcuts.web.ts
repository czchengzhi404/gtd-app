import { useEffect } from "react";

import { findShortcut, type ShortcutSpec } from "../lib/shortcuts";

export type { ShortcutSpec } from "../lib/shortcuts";

/**
 * web/桌面实现：window keydown 监听。仅桌面增强使用；移动端走同路径的
 * .ts 基线 no-op 实现。
 *
 * 匹配规则（含"输入框内不触发"与 CmdOrCtrl 语义）全部在 lib/shortcuts.ts，
 * 这里只负责挂监听与阻止默认行为。
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutSpec[],
  handler: (key: string) => void,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const match = findShortcut(e, e.target as { tagName?: string; isContentEditable?: boolean } | null, shortcuts);
      if (match === undefined) return;
      e.preventDefault();
      handler(match.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, handler]);
}

import { useEffect } from "react";

/**
 * web/桌面实现：window keydown 监听。仅桌面增强使用；移动端走同路径的
 * .ts 基线 no-op 实现。
 *
 * modifier: "ctrl" 表示 CmdOrCtrl（Windows/Linux 用 Ctrl，macOS 用 Cmd），
 * 与 Electron globalShortcut 的 CommandOrControl 语义保持一致。
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
      const match = shortcuts.find((s) => {
        if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
        switch (s.modifier) {
          case undefined:
            return true;
          case "ctrl":
            return e.ctrlKey || e.metaKey;
          case "meta":
            return e.metaKey;
          case "shift":
            return e.shiftKey;
          case "alt":
            return e.altKey;
        }
      });
      if (match) {
        e.preventDefault();
        handler(match.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, handler]);
}

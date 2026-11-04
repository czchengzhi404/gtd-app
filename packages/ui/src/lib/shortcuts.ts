/**
 * 键盘快捷键的纯函数内核（可单测，不依赖 DOM/React）。
 *
 * 平台文件（.web.ts / .ts）只负责"监听事件 → 调 findShortcut → 调 handler"，
 * 匹配规则全部收敛在这里，避免 web/native 两份实现漂移。
 */

export interface ShortcutSpec {
  /** 与 KeyboardEvent.key 语义一致（大小写不敏感；"Escape" 等特殊键按原样比较） */
  key: string;
  /** ctrl = CmdOrCtrl（macOS 用 Cmd，Windows/Linux 用 Ctrl） */
  modifier?: "ctrl" | "shift" | "alt" | "meta";
  /**
   * 是否允许在输入框/文本域/contentEditable 内触发。
   * 默认 false：编辑文本时 Ctrl+Z、数字键、方向键都应该留给输入框本身。
   * 全局命令（如命令面板 Ctrl+K）可显式设为 true。
   */
  allowInInput?: boolean;
}

/** 当前焦点是否在可编辑元素上（输入框、文本域、select、contentEditable） */
export function isEditableTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (target === null || target === undefined) return false;
  if (target.isContentEditable === true) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** 单个 spec 是否匹配事件（修饰键：ctrl 表示 CmdOrCtrl；shift/alt 必须精确按下） */
export function matchesShortcut(event: KeyEventLike, spec: ShortcutSpec): boolean {
  if (event.key.toLowerCase() !== spec.key.toLowerCase()) return false;
  switch (spec.modifier) {
    case undefined:
      // 无修饰键的快捷键不响应带 Ctrl/Cmd/Alt 的组合（避免和系统快捷键抢）
      return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    case "ctrl":
      return (event.ctrlKey || event.metaKey) && !event.altKey;
    case "meta":
      return event.metaKey;
    case "shift":
      // 仅 Shift 组合：不能再带 Ctrl/Cmd/Alt，避免与 Ctrl+Shift+Z 之类抢事件
      return event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
    case "alt":
      return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  }
}

/**
 * 从事件里找出第一个匹配的 spec；焦点在可编辑元素时跳过未声明
 * `allowInInput: true` 的 spec。
 */
export function findShortcut(
  event: KeyEventLike,
  target: { tagName?: string; isContentEditable?: boolean } | null | undefined,
  specs: readonly ShortcutSpec[],
): ShortcutSpec | undefined {
  const editable = isEditableTarget(target);
  return specs.find((spec) => {
    if (editable && spec.allowInInput !== true) return false;
    return matchesShortcut(event, spec);
  });
}

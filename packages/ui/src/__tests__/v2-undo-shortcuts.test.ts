import { describe, expect, test } from "bun:test";

import {
  findShortcut,
  isEditableTarget,
  matchesShortcut,
  type ShortcutSpec,
} from "../lib/shortcuts";
import {
  peekUndo,
  popUndo,
  pruneUndo,
  pushUndo,
  UNDO_STACK_LIMIT,
  UNDO_TTL_MS,
  type UndoEntry,
} from "../lib/undo-stack";

function entry(id: string, createdAt = 1000): UndoEntry {
  return { id, message: `m-${id}`, actionLabel: "撤销", run: () => undefined, createdAt };
}

const NOW = 10_000;

describe("undo-stack · 有界栈", () => {
  test("push 追加到末尾，最新在栈顶", () => {
    let stack = pushUndo([], entry("a"));
    stack = pushUndo(stack, entry("b"));
    expect(stack.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("超过上限时丢弃最旧，保留最近 N 条", () => {
    let stack: UndoEntry[] = [];
    for (let i = 0; i < UNDO_STACK_LIMIT + 3; i++) {
      stack = pushUndo(stack, entry(`e${String(i)}`, NOW));
    }
    expect(stack.length).toBe(UNDO_STACK_LIMIT);
    expect(stack[0]?.id).toBe("e3");
    expect(stack[stack.length - 1]?.id).toBe(`e${String(UNDO_STACK_LIMIT + 2)}`);
  });

  test("pop 后进先出，并返回剩余栈", () => {
    const stack = [entry("a"), entry("b")];
    const first = popUndo(stack, NOW);
    expect(first.entry?.id).toBe("b");
    expect(first.rest.map((item) => item.id)).toEqual(["a"]);
    const second = popUndo(first.rest, NOW);
    expect(second.entry?.id).toBe("a");
    expect(second.rest).toEqual([]);
  });

  test("空栈 pop 不抛错", () => {
    const result = popUndo([], NOW);
    expect(result.entry).toBeNull();
    expect(result.rest).toEqual([]);
  });

  test("超过 TTL 的条目被惰性清理（含混合新旧）", () => {
    const stale = entry("stale", NOW - UNDO_TTL_MS - 1);
    const fresh = entry("fresh", NOW - 1000);
    const result = popUndo([stale, fresh], NOW);
    expect(result.entry?.id).toBe("fresh");
    expect(result.rest).toEqual([]);
    expect(pruneUndo([stale, fresh], NOW).map((item) => item.id)).toEqual(["fresh"]);
  });

  test("全部过期时返回空，不残留", () => {
    const old = NOW - UNDO_TTL_MS - 1;
    const result = popUndo([entry("a", old), entry("b", old)], NOW);
    expect(result.entry).toBeNull();
    expect(result.rest).toEqual([]);
  });

  test("peek 只读不弹出", () => {
    const stack = [entry("a"), entry("b")];
    expect(peekUndo(stack, NOW)?.id).toBe("b");
    expect(stack).toHaveLength(2);
  });
});

const event = (key: string, mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">> = {}) => ({
  key,
  ctrlKey: mods.ctrlKey ?? false,
  metaKey: mods.metaKey ?? false,
  shiftKey: mods.shiftKey ?? false,
  altKey: mods.altKey ?? false,
});

describe("shortcuts · 匹配规则", () => {
  test("key 大小写不敏感", () => {
    expect(matchesShortcut(event("K"), { key: "k" })).toBe(true);
    expect(matchesShortcut(event("Escape"), { key: "Escape" })).toBe(true);
  });

  test("无修饰键的 spec 不响应带 Ctrl/Cmd/Alt 的组合", () => {
    expect(matchesShortcut(event("1", { ctrlKey: true }), { key: "1" })).toBe(false);
    expect(matchesShortcut(event("1"), { key: "1" })).toBe(true);
  });

  test("ctrl 同时匹配 Ctrl 与 Cmd（CmdOrCtrl 语义）", () => {
    expect(matchesShortcut(event("k", { ctrlKey: true }), { key: "k", modifier: "ctrl" })).toBe(true);
    expect(matchesShortcut(event("k", { metaKey: true }), { key: "k", modifier: "ctrl" })).toBe(true);
  });

  test("不符合的修饰键不匹配", () => {
    expect(matchesShortcut(event("k"), { key: "k", modifier: "ctrl" })).toBe(false);
    expect(matchesShortcut(event("z", { ctrlKey: true, shiftKey: true }), { key: "z", modifier: "shift" })).toBe(
      false,
    );
  });

  test("输入框内默认跳过快捷键，allowInInput 例外", () => {
    const specs: ShortcutSpec[] = [
      { key: "z", modifier: "ctrl" },
      { key: "k", modifier: "ctrl", allowInInput: true },
    ];
    const input = { tagName: "INPUT", isContentEditable: false };
    expect(findShortcut(event("z", { ctrlKey: true }), input, specs)).toBeUndefined();
    expect(findShortcut(event("k", { ctrlKey: true }), input, specs)?.key).toBe("k");
    expect(findShortcut(event("z", { ctrlKey: true }), { tagName: "DIV" }, specs)?.key).toBe("z");
  });

  test("isEditableTarget 覆盖 input/textarea/select/contentEditable", () => {
    expect(isEditableTarget({ tagName: "input" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

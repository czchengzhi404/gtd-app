import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { appStore, type AppState } from "@gtd/core";

/**
 * React 绑定层：core 的 vanilla store → React hook（ui 包职责，core 不依赖 React）。
 * 内部套 useShallow：GTD 选择器返回派生数组（filter 结果），浅比较保持快照稳定，
 * 避免 React getSnapshot 无限循环（zustand v5 纪律）。
 */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, useShallow(selector));
}

import * as Font from "expo-font";
import { appStore } from "@gtd/core";

/**
 * 内置霞鹜文楷的按需加载。
 *
 * 默认字体是系统默认（v0.11.0 起）；19MB 的 TTF 只在用户选中"霞鹜文楷"
 * 时才载入（启动后按 kv 判断一次 + 设置页切换时补载），不再每次启动必载。
 */
let loaded = false;

export async function ensureBuiltinFont(): Promise<void> {
  if (loaded) return;
  await Font.loadAsync({
    LXGWWenKai: require("../../assets/fonts/LXGWWenKai-Regular.ttf"),
  });
  loaded = true;
}

/** kv 里当前是否选中内置字体（默认 system） */
export function isBuiltinFontSelected(): boolean {
  return (appStore.getState().kv["font.family"] ?? "system") === "LXGWWenKai";
}

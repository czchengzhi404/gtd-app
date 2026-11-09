/**
 * expo-router 的原生 intent 改写钩子。
 *
 * 为什么需要它：别的应用把 `.json` 递过来时（微信「用其他应用打开」），
 * intent 的 data 是 `content://...`。expo-router 会把它当深链处理，
 * 归一化成 `gtd://com.android.externalstorage.documents/...`，
 * 然后渲染 Unmatched Route —— 用户看到的是一整页报错。
 *
 * 这里在路由计算**之前**把它改写成一条真实存在的路由。
 * 原始 URL 不放进路由参数（会被百分号解码破坏成非法 URI），
 * 而是存进模块变量，由 /import-incoming 页面取走 —— 同一个 JS 实例，不经过编解码。
 *
 * 注意：这个钩子只覆盖**冷启动**。热启动（App 在后台时收到新 intent）走不到这里，
 * 那条路径由根布局里的 `Linking` 监听兜住，跳同一个页面。
 */
import { setPendingImportUrl } from "@/platform/incoming-file";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (setPendingImportUrl(path)) {
    return "/import-incoming";
  }
  return path;
}

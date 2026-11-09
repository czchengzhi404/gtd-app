/**
 * expo-router 的原生 intent 改写钩子。
 *
 * 为什么需要它：别的应用把 `.json` 递过来时（微信「用其他应用打开」），
 * intent 的 data 是 `content://...`。expo-router 会把它当深链处理，
 * 归一化成 `gtd://com.android.externalstorage.documents/...`，
 * 然后渲染 Unmatched Route —— 用户看到的是一整页报错。
 *
 * 这里在路由计算**之前**把它改写成一条真实存在的路由，
 * 并把原始 URL 原样作为参数带过去，由 /import-incoming 页面负责真正读文件。
 *
 * 注意：这个钩子只覆盖**冷启动**。热启动（App 在后台时收到新 intent）走不到这里，
 * 那条路径由根布局里的 `Linking` 监听兜住，跳同一个页面。
 */

/** 能直接读的文件 URL：别的应用通过 FileProvider 给的 content://，或旧式 file:// */
function isFileUrl(url: string): boolean {
  return url.startsWith("content://") || url.startsWith("file://");
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (isFileUrl(path)) {
    return `/import-incoming?raw=${encodeURIComponent(path)}`;
  }
  return path;
}

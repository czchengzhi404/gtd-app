/**
 * 接住别的应用递进来的文件（ACTION_VIEW）。
 *
 * 场景：微信里收到 .json → 「用其他应用打开」→ 选 GTD List。
 * 系统把文件以 `content://` 形式放在 intent data 里，我们通过两条路拿到：
 * - 冷启动：`app/+native-intent.ts` 的 `redirectSystemPath` 拿到**完整原始 URL**
 * - 热启动：`Linking` 的 `url` 事件
 *
 * 为什么用模块变量传 URL，而不是塞进路由参数：
 * 路由参数会经历百分号解码，`content://.../primary%3ADocuments%2Ffile.json`
 * 到页面里就变成了 `primary:Documents/file.json` —— URI 结构被破坏，
 * 系统直接报 `Invalid URI`。base64 也要额外实现解码器。
 * 而 `+native-intent` 和导入页在同一个 JS 实例里，一个模块变量就够了，
 * 且完全不经过任何编解码。
 */
import { Linking } from "react-native";

/** 等待导入的文件 URL（由 +native-intent 或 url 事件写入，导入页消费一次即清空） */
let pendingUrl: string | null = null;

/** 已经处理过的 URL，防止冷启动 + 事件双触发导致重复导入 */
const handled = new Set<string>();

/** 能直接读的文件 URL：别的应用通过 FileProvider 给的 content://，或旧式 file:// */
export function isFileUrl(url: string): boolean {
  return url.startsWith("content://") || url.startsWith("file://");
}

/** 记下待导入的文件（幂等：同一个 URL 只记一次） */
export function setPendingImportUrl(url: string): boolean {
  if (!isFileUrl(url) || handled.has(url)) return false;
  handled.add(url);
  pendingUrl = url;
  return true;
}

/** 取走待导入的 URL（只返回一次） */
export function takePendingImportUrl(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}

/** 热启动（App 已在后台）时收到文件 */
export function subscribeIncomingFile(onFile: (url: string) => void): () => void {
  const sub = Linking.addEventListener("url", ({ url }) => {
    if (!isFileUrl(url)) return;
    if (handled.has(url)) return;
    handled.add(url);
    onFile(url);
  });
  return () => sub.remove();
}

/**
 * 读出 content:// / file:// 的内容。
 *
 * `readAsStringAsync` 在 Android 上走 ContentResolver，能读别的应用通过
 * FileProvider 递过来的 URI（SAF 同步那条链路也是这么读的）。
 */
export async function readIncomingFile(url: string): Promise<string> {
  const FileSystem = await import("expo-file-system/legacy");
  return FileSystem.readAsStringAsync(url, { encoding: FileSystem.EncodingType.UTF8 });
}

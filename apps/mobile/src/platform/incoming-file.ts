/**
 * 接住别的应用递进来的文件（ACTION_VIEW）。
 *
 * 场景：微信里收到 .json → 「用其他应用打开」→ 选 GTD List。
 * 系统把文件以 `content://` 形式放在 intent data 里，RN 通过
 * `Linking.getInitialURL()`（冷启动）或 `url` 事件（热启动）交给我们。
 *
 * 不复制进沙盒：这份文件只读一次，复制一份只会留下孤儿副本
 * （附件才需要复制，因为它的 content:// 授权是临时的，而这里读完即弃）。
 */
import { Linking } from "react-native";

/** 冷启动时的那一次 URL；模块加载早期就抓到，避免被 router 消费后才读 */
const initialUrlPromise: Promise<string | null> = Linking.getInitialURL().catch(() => null);

/** 已经处理过的 URL，防止冷启动 + 事件双触发导致重复导入 */
const handled = new Set<string>();

/** 看起来像一份可导入文件吗（content:// 或 file://） */
export function isFileUrl(url: string): boolean {
  return url.startsWith("content://") || url.startsWith("file://");
}

/** 取冷启动带进来的文件 URL（只返回一次） */
export async function takeInitialFileUrl(): Promise<string | null> {
  const url = await initialUrlPromise;
  if (url === null || !isFileUrl(url)) return null;
  if (handled.has(url)) return null;
  handled.add(url);
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

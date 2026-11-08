import * as FileSystem from "expo-file-system/legacy";
import type { FilesPort } from "@gtd/core";

/**
 * 基于 Android SAF（存储访问框架）的 FilesPort。
 *
 * 为什么需要它：`createFolderProvider` 只依赖 `FilesPort` 的 4 个方法
 * （readFile / writeFile / listDir / mkdir），路径是普通字符串。
 * 移动端拿到的是 SAF 的 `content://` 目录 URI，不能当文件路径拼，但只要把
 * 「字符串路径 → SAF URI」的映射做出来，就能**直接复用桌面的同步逻辑**，
 * 不必另写一套 provider，也不会出现「手机自用、不与桌面互通」的孤岛。
 *
 * 几个 SAF 的坑：
 * - **写文件不能覆盖**：必须先 delete 再 createFile，否则 createFile 会失败或产生 `xxx (1).json`
 * - **目录要逐级建**：`createDirectoryAsync(parent, name)` 只建一层，返回新 URI，
 *   所以这里用小缓存（相对路径 → URI）避免每次都遍历
 * - **`readDirectoryAsync` 返回的是子项 URI 列表**，不是文件名，需要从 URI 末段解码
 */
export class SafFilesPort implements FilesPort {
  /** 相对路径（""=根目录）→ SAF 目录 URI */
  private readonly dirCache = new Map<string, string>();

  constructor(private readonly rootUri: string) {
    const root = rootUri.replace(/[\\/]+$/, "");
    this.rootUri = root;
    this.dirCache.set("", root);
  }

  /** 把「根 URI + 相对路径」还原成相对路径 */
  private toRelative(path: string): string {
    const trimmed = path.replace(/[\\/]+$/, "");
    if (trimmed === this.rootUri) return "";
    if (trimmed.startsWith(this.rootUri)) {
      return trimmed.slice(this.rootUri.length).replace(/^[\\/]+/, "");
    }
    return trimmed;
  }

  private async listRaw(dirUri: string): Promise<{ name: string; uri: string }[]> {
    const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
    return uris.map((uri) => {
      const decoded = decodeURIComponent(uri);
      const name = decoded.split("/").filter((part) => part.length > 0).pop() ?? "";
      return { name, uri };
    });
  }

  /** 逐级确保目录存在，返回目录 URI */
  private async ensureDirUri(relative: string): Promise<string> {
    const cached = this.dirCache.get(relative);
    if (cached !== undefined) return cached;

    const segments = relative.split("/").filter((part) => part.length > 0);
    let currentRel = "";
    let currentUri = this.rootUri;

    for (const segment of segments) {
      const nextRel = currentRel.length === 0 ? segment : `${currentRel}/${segment}`;
      const hit = this.dirCache.get(nextRel);
      if (hit !== undefined) {
        currentRel = nextRel;
        currentUri = hit;
        continue;
      }
      const entries = await this.listRaw(currentUri);
      const existing = entries.find((entry) => entry.name === segment);
      currentUri = existing?.uri ?? (await FileSystem.StorageAccessFramework.makeDirectoryAsync(currentUri, segment));
      this.dirCache.set(nextRel, currentUri);
      currentRel = nextRel;
    }

    return currentUri;
  }

  async readFile(path: string): Promise<string | null> {
    const segments = this.toRelative(path).split("/").filter((part) => part.length > 0);
    const fileName = segments.pop();
    if (fileName === undefined) return null;
    try {
      const dirUri = await this.ensureDirUri(segments.join("/"));
      const entries = await this.listRaw(dirUri);
      const file = entries.find((entry) => entry.name === fileName);
      if (file === undefined) return null;
      return await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch {
      return null;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const segments = this.toRelative(path).split("/").filter((part) => part.length > 0);
    const fileName = segments.pop();
    if (fileName === undefined) throw new Error(`writeFile 路径无效：${path}`);

    const dirUri = await this.ensureDirUri(segments.join("/"));
    const entries = await this.listRaw(dirUri);
    const existing = entries.find((entry) => entry.name === fileName);
    if (existing !== undefined) {
      // SAF 不能直接覆盖：先删再建
      await FileSystem.StorageAccessFramework.deleteAsync(existing.uri).catch(() => undefined);
    }

    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, fileName, "application/json");
    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  async listDir(path: string): Promise<string[]> {
    try {
      const dirUri = await this.ensureDirUri(this.toRelative(path));
      const entries = await this.listRaw(dirUri);
      return entries.map((entry) => entry.name).filter((name) => name.length > 0 && !name.startsWith("."));
    } catch {
      return [];
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.ensureDirUri(this.toRelative(path));
  }
}

/** 让用户选一个目录（SAF），返回持久目录 URI；取消返回 null */
export async function pickSafDirectory(): Promise<string | null> {
  try {
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) return null;
    return result.directoryUri;
  } catch {
    return null;
  }
}

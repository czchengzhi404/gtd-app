/** preload 桥的最小接口（与 apps/desktop/src/preload/preload.ts 保持一致）。
 *  仅在 Electron 渲染进程中存在；桌面专属能力由调用方判空/守卫。 */
export interface GtdApi {
  command(
    op: string,
    payload: unknown,
  ): Promise<{ ids: string[]; records: unknown[]; serverTime: number }>;
  query(sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>;
  notify(payload: { title: string; body: string; taskId?: string }): Promise<boolean>;
  dialog: {
    open(options?: { directory?: boolean }): Promise<string | null>;
    save(options?: { defaultPath?: string }): Promise<string | null>;
  };
  fs: {
    readFile(path: string): Promise<string | null>;
    writeFile(path: string, content: string): Promise<boolean>;
    listDir(path: string): Promise<string[]>;
  };
  sync: { setFolderRoot(root: string): Promise<string> };
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}

export function gtd(): GtdApi {
  const api = (globalThis as { gtd?: GtdApi }).gtd;
  if (api === undefined) {
    throw new Error("window.gtd 不存在：不在 Electron 渲染进程中");
  }
  return api;
}

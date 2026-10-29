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
  backup: {
    now(): Promise<{ ok: boolean; file?: string; count?: number; error?: string }>;
    list(): Promise<{ count: number; latest: string | null }>;
    restore(): Promise<{ ok: boolean; file?: string; error?: string }>;
  };
  secret: {
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertext: string): Promise<string>;
  };
  menu: {
    context(
      items: { id: string; label: string; enabled?: boolean; type?: "separator" }[],
      pos?: { x: number; y: number },
    ): Promise<string | null>;
  };
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}

/** 是否运行在 Electron 渲染进程中（存在 preload 桥） */
export function hasDesktopBridge(): boolean {
  return typeof globalThis !== "undefined" && (globalThis as { gtd?: unknown }).gtd !== undefined;
}

export function gtd(): GtdApi {
  const api = (globalThis as { gtd?: GtdApi }).gtd;
  if (api === undefined) {
    throw new Error("window.gtd 不存在：不在 Electron 渲染进程中");
  }
  return api;
}

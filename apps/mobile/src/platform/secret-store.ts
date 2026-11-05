import { isDesktop } from "./env";
import { gtd } from "./gtd-api";

/**
 * 同步凭据的落盘方式（两端不同，kv 里只留指针/密文）：
 * - 桌面：`enc:<base64>`（Electron safeStorage，OS 级加密；无 safeStorage 时 `b64:` 降级）
 * - 移动：`sec:<slot>`——真正的密码存在系统安全存储（iOS Keychain / Android Keystore），
 *   kv 里只留这个指针。这样导出/备份 JSON、同步日志、崩溃日志都不会带明文。
 *
 * `openSecret` 对明文是幂等的（老配置里就是明文），保证升级后旧配置仍能读。
 */

const SEC_PREFIX = "sec:";
const ENC_PREFIX = "enc:";
const B64_PREFIX = "b64:";

function slotKey(slot: string): string {
  return `gtd.sync.${slot}`;
}

/** 需要显式接管的敏感字段槽位 */
export type SecretSlot = "password" | "s3";

export async function sealSecret(plaintext: string, slot: SecretSlot): Promise<string> {
  if (plaintext.length === 0) return "";

  if (isDesktop()) {
    // 桌面沿用 safeStorage（主进程实现，内部含 b64 降级）
    return gtd().secret.encrypt(plaintext);
  }

  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(slotKey(slot), plaintext);
    return `${SEC_PREFIX}${slot}`;
  } catch {
    // 安全存储不可用（例如某些模拟器/被裁剪的 ROM）：退回明文，由 UI 提示风险
    return plaintext;
  }
}

export async function openSecret(stored: string | undefined, slot: SecretSlot): Promise<string | undefined> {
  if (stored === undefined || stored.length === 0) return undefined;

  if (stored.startsWith(SEC_PREFIX)) {
    try {
      const SecureStore = await import("expo-secure-store");
      const value = await SecureStore.getItemAsync(slotKey(slot));
      return value ?? undefined;
    } catch {
      return undefined;
    }
  }

  if (isDesktop() && (stored.startsWith(ENC_PREFIX) || stored.startsWith(B64_PREFIX))) {
    try {
      return await gtd().secret.decrypt(stored);
    } catch {
      return undefined;
    }
  }

  return stored;
}

export async function forgetSecret(slot: SecretSlot): Promise<void> {
  if (isDesktop()) return;
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.deleteItemAsync(slotKey(slot));
  } catch {
    /* 忽略：删不掉也不影响（指针已被覆盖） */
  }
}

/** 移动端安全存储是否可用（用于设置页提示） */
export async function isSecureStorageAvailable(): Promise<boolean> {
  if (isDesktop()) return true;
  try {
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * uuid v7（时间有序，适合本地 SQLite 主键与同步合并的字典序决胜）。
 * 随机源可注入：默认用 globalThis.crypto.getRandomValues（Electron/Expo 环境
 * 均可用），测试环境可替换为确定性源。
 */
let randomBytes: (n: number) => Uint8Array = (n) => {
  const buf = new Uint8Array(n);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(buf);
    return buf;
  }
  // 兜底：无 crypto 的极端环境（仅影响随机性质量，不影响格式正确性）
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
};

export function setRandomBytesSource(source: (n: number) => Uint8Array): void {
  randomBytes = source;
}

export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  const ts = BigInt(Math.max(0, Math.trunc(now))) & ((1n << 48n) - 1n);
  // 48 位时间戳
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  // version 7
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // variant 10xx
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

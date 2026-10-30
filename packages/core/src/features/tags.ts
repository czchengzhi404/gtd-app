/**
 * 标签归一化（core 唯一实现，UI/解析/命令共用）。
 *
 * 规则：
 * - 去掉前导 #，去首尾空白
 * - 内部空白压成单个 "-"（标签不能含空格，避免筛选时歧义）
 * - 去掉 # @ + > ! 等快捷输入保留字符
 * - 最长 24 字符；空串表示无效
 * - 大小写保留原样，比较时由调用方做不区分大小写的去重
 */

const MAX_TAG_LENGTH = 24;

export function normalizeTag(raw: string): string {
  let value = raw.trim();
  while (value.startsWith("#")) value = value.slice(1).trim();
  if (value === "") return "";
  value = value.replace(/[\s#@+>!]+/gu, "-");
  value = value.replace(/^-+|-+$/gu, "");
  if (value.length > MAX_TAG_LENGTH) value = value.slice(0, MAX_TAG_LENGTH);
  return value;
}

/** 批量归一化：丢弃空值，按不区分大小写去重，保持首次出现顺序 */
export function normalizeTags(raw: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (tag === "") continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

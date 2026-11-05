/**
 * 文本计量（纯函数，无 IO）：给写作场景提供"字数"这个最基础的刻度。
 *
 * 为什么不用 `text.length`：
 * - 中文 `length` 与"字数"恰好接近，但英文 `length` 是字符数，会高估 5 倍；
 * - emoji 在 UTF-16 里占 2 个 code unit，`length` 会多算。
 *
 * 计数规则（与常见中文写作工具一致）：
 * - CJK 字符（汉字/假名/全角标点之外的汉字区）：每字计 1
 * - 拉丁字母或数字连续串：计 1 词（`don't`、`state-of-the-art` 算 1）
 * - `words` = cjk + latin，即"字数"
 * - `characters` 按 Unicode 码点计（含标点与空格），用于"字符数"展示
 */

export interface TextCount {
  /** 中日韩字符数 */
  cjk: number;
  /** 拉丁/数字词数 */
  latin: number;
  /** 字数 = cjk + latin（写作工具里的"字数"） */
  words: number;
  /** 字符数（按码点，含标点与空格） */
  characters: number;
  /** 段落数：连续非空行算一段 */
  paragraphs: number;
  /** 估算阅读时长（分钟），按 400 字/分钟，向上取整；空文本为 0 */
  readingMinutes: number;
  /** 估算写作时长（分钟），按 300 字/小时的真实写作速度；空文本为 0 */
  writingMinutes: number;
}

const CJK_RANGES: [number, number][] = [
  [0x3040, 0x30ff], // 平假名 / 片假名
  [0x3400, 0x4dbf], // 汉字扩展 A
  [0x4e00, 0x9fff], // 汉字基本区
  [0xf900, 0xfaff], // 兼容汉字
  [0x20000, 0x2fa1f], // 扩展 B–F
];

function isCjk(codePoint: number): boolean {
  for (const [start, end] of CJK_RANGES) {
    if (codePoint >= start && codePoint <= end) return true;
  }
  return false;
}

/** 拉丁词：字母/数字开头，允许词内连字符与撇号（don't / state-of-the-art 算一个词） */
const LATIN_WORD = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;

export const WORDS_PER_MINUTE_READING = 400;
export const WORDS_PER_HOUR_WRITING = 300;

/**
 * 计数缓存（有界 LRU）。
 *
 * 为什么需要：写作统计/项目字数这类聚合会**反复**统计同一批正文——
 * 2000 条任务、每条 800 字的库，全量统计一次要 13ms；每次渲染都跑就必然掉帧。
 * 正文只要没被编辑，结果就是稳定的，缓存后聚合降到 ~0.1ms。
 *
 * 边界：只缓存 8KB 以内的文本（长文换新对象代价高、命中率低），
 * 上限 200 条（最坏内存约 1.6MB）；超出后按插入顺序淘汰最旧的。
 */
const CACHE_LIMIT = 200;
const CACHE_MAX_TEXT = 8_000;
const textCache = new Map<string, TextCount>();

function cacheGet(key: string): TextCount | undefined {
  const hit = textCache.get(key);
  if (hit === undefined) return undefined;
  // 命中后移到末尾（Map 保持插入顺序 → 天然 LRU）
  textCache.delete(key);
  textCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: TextCount): void {
  if (key.length > CACHE_MAX_TEXT) return;
  if (textCache.size >= CACHE_LIMIT) {
    const oldest = textCache.keys().next();
    if (oldest.done !== true) textCache.delete(oldest.value);
  }
  textCache.set(key, value);
}

/** 清空缓存（测试/诊断用） */
export function clearWordCountCache(): void {
  textCache.clear();
}

export function countText(source: string): TextCount {
  const cached = cacheGet(source);
  if (cached !== undefined) return cached;

  const computed = computeTextCount(source);
  cacheSet(source, computed);
  return computed;
}

function computeTextCount(source: string): TextCount {
  if (source.length === 0) {
    return {
      cjk: 0,
      latin: 0,
      words: 0,
      characters: 0,
      paragraphs: 0,
      readingMinutes: 0,
      writingMinutes: 0,
    };
  }

  let cjk = 0;
  let characters = 0;
  for (const char of source) {
    characters += 1;
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && isCjk(codePoint)) cjk += 1;
  }

  const latin = (source.match(LATIN_WORD) ?? []).length;
  const words = cjk + latin;

  let paragraphs = 0;
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().length > 0) paragraphs += 1;
  }

  return {
    cjk,
    latin,
    words,
    characters,
    paragraphs,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE_READING)),
    writingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil((words / WORDS_PER_HOUR_WRITING) * 60)),
  };
}

/** 只要字数（列表里批量统计用，省掉其它字段的构造） */
export function countWords(source: string): number {
  return countText(source).words;
}

/** 多段文本合计（项目总字数）：只累加原始计数，再统一算时长 */
export function sumTextCounts(counts: readonly TextCount[]): TextCount {
  const total: TextCount = {
    cjk: 0,
    latin: 0,
    words: 0,
    characters: 0,
    paragraphs: 0,
    readingMinutes: 0,
    writingMinutes: 0,
  };
  for (const item of counts) {
    total.cjk += item.cjk;
    total.latin += item.latin;
    total.words += item.words;
    total.characters += item.characters;
    total.paragraphs += item.paragraphs;
  }
  total.readingMinutes =
    total.words === 0 ? 0 : Math.max(1, Math.ceil(total.words / WORDS_PER_MINUTE_READING));
  total.writingMinutes =
    total.words === 0 ? 0 : Math.max(1, Math.ceil((total.words / WORDS_PER_HOUR_WRITING) * 60));
  return total;
}

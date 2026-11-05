import type { Project, Task } from "../models/task";
import type { AppState } from "../store/app-store";

/**
 * 全局搜索（任务 + 项目，纯函数）。
 *
 * 评分层级固定（同一命中只取最高层级，不叠加）：
 *   标题全等 100 > 标题前缀 70 > 标题包含 50 > 笔记包含 30 > 标签/情境命中 25
 * 同分按 updatedAt 降序（最近改动优先），再按 id 升序保证确定性。
 * 空 query（或纯空白）直接返回空结果。大小写不敏感；中文原样匹配，
 * 中英混排按同一规则处理（toLowerCase 不改变中文码点）。
 *
 * v2.4 起支持：
 * - **多词 AND**：`雨 比喻` 要求两个词都出现（可以分散在不同字段），
 *   而不是整串当成一个子串——写作者常记不住原句连着怎么写的。
 * - **字段范围**：`scope: "title" | "notes"` 只搜标题或只搜正文。
 * 单词查询的行为与升级前完全一致（除新增 scope）。
 */

export type SearchHitKind = "task" | "project";
export type SearchMatchedField = "title" | "notes" | "tag" | "context";

/** 搜索范围：all=标题+正文+标签+情境；title=只看标题；notes=只看正文 */
export type SearchScope = "all" | "title" | "notes";

export interface SearchOptions {
  scope?: SearchScope;
}

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  title: string;
  snippet: string;
  score: number;
  matchedField: SearchMatchedField;
}

export interface SearchResult {
  tasks: SearchHit[];
  projects: SearchHit[];
  total: number;
}

const SNIPPET_RADIUS = 20;

/**
 * 倒排索引：token → 任务 id 集合。
 *
 * 用途：把搜索从"遍历全库每条正文"缩成"先取候选集再精确验证"。
 * 索引只是**预筛**——最终仍用 `indexOf` 验证 token 真的作为子串出现，
 * 所以不会因为分词粒度而漏结果（bigram 是子串出现的必要条件）。
 *
 * 为什么按 `state.tasks` 的对象引用缓存：store 是不可变更新的，
 * 任务集合没变时索引一直有效；任意任务被编辑都会产生新的 tasks 对象，
 * 索引随之重建（WeakMap 自动释放旧索引）。
 */
interface SearchIndex {
  /** token（小写）→ 任务 id */
  postings: Map<string, Set<string>>;
}

const indexCache = new WeakMap<Record<string, unknown>, SearchIndex>();

const LATIN_TOKEN = /[a-z0-9]+/g;
const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;

/** 建立索引：拉丁按词、CJK 按单字 + 相邻双字（bigram） */
function buildIndex(
  tasks: Record<string, { id: string; title: string; notes: string; tags: readonly string[] }>,
): SearchIndex {
  const postings = new Map<string, Set<string>>();
  const add = (token: string, id: string) => {
    let bucket = postings.get(token);
    if (bucket === undefined) {
      bucket = new Set();
      postings.set(token, bucket);
    }
    bucket.add(id);
  };

  for (const task of Object.values(tasks)) {
    // 标签也进索引：searchAll 允许命中标签，索引漏掉会导致预筛丢结果
    const text = `${lower(task.title)}\n${lower(task.notes)}\n${lower(task.tags.join(" "))}`;
    for (const match of text.matchAll(LATIN_TOKEN)) add(match[0], task.id);
    for (const run of text.match(CJK_RUN) ?? []) {
      for (let i = 0; i < run.length; i += 1) {
        add(run[i]!, task.id);
        if (i + 1 < run.length) add(`${run[i]}${run[i + 1]}`, task.id);
      }
    }
  }
  return { postings };
}

function getIndex(state: AppState): SearchIndex {
  const cached = indexCache.get(state.tasks as unknown as Record<string, unknown>);
  if (cached !== undefined) return cached;
  const built = buildIndex(
    state.tasks as unknown as Record<
      string,
      { id: string; title: string; notes: string; tags: readonly string[] }
    >,
  );
  indexCache.set(state.tasks as unknown as Record<string, unknown>, built);
  return built;
}

/**
 * 单个 token 的候选 id（可能为 null = 索引里没有该 token，说明全库都不含它）。
 * CJK 词取 bigram 交集（更精确），单字取单字桶。
 */
function candidatesForToken(index: SearchIndex, token: string): Set<string> | null {
  const lowered = lower(token);
  const cjkRuns = lowered.match(CJK_RUN);
  if (cjkRuns !== null && cjkRuns.join("") === lowered && lowered.length >= 2) {
    let result: Set<string> | null = null;
    for (let i = 0; i + 1 < lowered.length; i += 1) {
      const bucket = index.postings.get(lowered.slice(i, i + 2));
      if (bucket === undefined) return new Set();
      if (result === null) result = new Set(bucket);
      else {
        for (const id of [...result]) if (!bucket.has(id)) result.delete(id);
      }
      if (result.size === 0) return result;
    }
    return result;
  }
  const direct = index.postings.get(lowered);
  return direct === undefined ? new Set() : new Set(direct);
}

/**
 * 单个 token 的候选任务 id：索引（标题/正文/标签）+ 情境名命中。
 * 返回 null 表示该 token 在索引里完全不存在（可提前判定整体无结果）。
 */
function tokenCandidates(
  state: AppState,
  index: SearchIndex,
  contextNameById: Map<string, string>,
  token: string,
): Set<string> | null {
  const result = new Set<string>();

  const fromIndex = candidatesForToken(index, token);
  if (fromIndex === null) return null;
  for (const id of fromIndex) result.add(id);

  // 情境名：数量少（通常 < 20），直接线性找命中的情境，再按 contextIds 反查任务
  const needle = lower(token);
  const matchedContexts = new Set<string>();
  for (const [contextId, name] of contextNameById) {
    if (lower(name).includes(needle)) matchedContexts.add(contextId);
  }
  if (matchedContexts.size > 0) {
    for (const task of Object.values(state.tasks)) {
      if (task.contextIds.some((contextId) => matchedContexts.has(contextId))) result.add(task.id);
    }
  }

  return result;
}

/** 多 token 候选交集；任一 token 无候选即整体无结果 */
function candidateIds(
  state: AppState,
  index: SearchIndex,
  contextNameById: Map<string, string>,
  tokens: string[],
): Set<string> | null {
  let result: Set<string> | null = null;
  for (const token of tokens) {
    const set = tokenCandidates(state, index, contextNameById, token);
    if (set === null) return new Set();
    if (result === null) result = set;
    else {
      for (const id of [...result]) if (!set.has(id)) result.delete(id);
    }
    if (result.size === 0) return result;
  }
  return result;
}

const FIELD_RANK: Record<SearchMatchedField, number> = {
  title: 0,
  notes: 1,
  tag: 2,
  context: 3,
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 小写缓存（有界）。
 *
 * 搜索每次都要 `toLowerCase()` 一遍标题与正文，2000×800 字的库单次约 27ms，
 * 其中相当一部分花在分配新的小写字符串上。按原串缓存后，同一批不变的正文
 * 只需在首次搜索时转换一次。
 *
 * 边界：只缓存 ≤8KB 的文本、上限 300 条（最坏约 2.4MB）；超出按插入顺序淘汰。
 */
const LOWER_CACHE_LIMIT = 300;
const LOWER_CACHE_MAX_TEXT = 8_000;
const lowerCache = new Map<string, string>();

/** 清空小写缓存（测试/诊断用） */
export function clearLowerCache(): void {
  lowerCache.clear();
}

function lower(value: string): string {
  const hit = lowerCache.get(value);
  if (hit !== undefined) {
    // 命中后移到末尾，维持 LRU
    lowerCache.delete(value);
    lowerCache.set(value, hit);
    return hit;
  }
  const computed = value.toLowerCase();
  if (value.length <= LOWER_CACHE_MAX_TEXT) {
    if (lowerCache.size >= LOWER_CACHE_LIMIT) {
      const oldest = lowerCache.keys().next();
      if (oldest.done !== true) lowerCache.delete(oldest.value);
    }
    lowerCache.set(value, computed);
  }
  return computed;
}

/** 按空白切词（中英混排同样按空白切），去空、按小写去重，保留首次出现的原形 */
export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const raw of query.trim().split(/\s+/)) {
    const token = raw.trim();
    if (token.length === 0) continue;
    const key = lower(token);
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

interface FieldMatch {
  score: number;
  index: number;
  text: string;
}

function matchTitle(text: string, token: string): FieldMatch | null {
  const hay = lower(text);
  const needle = lower(token);
  const index = hay.indexOf(needle);
  if (index < 0) return null;
  if (hay === needle) return { score: 100, index: 0, text };
  if (index === 0) return { score: 70, index: 0, text };
  return { score: 50, index, text };
}

function matchContains(text: string, token: string, score: number): FieldMatch | null {
  const index = lower(text).indexOf(lower(token));
  return index < 0 ? null : { score, index, text };
}

/** 命中位置前后各 20 字，压掉换行/连续空白 */
function snippetAround(text: string, index: number, tokenLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + tokenLength + SNIPPET_RADIUS);
  return collapseWhitespace(text.slice(start, end));
}

type Candidate = { field: SearchMatchedField; match: FieldMatch };

function pickBest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (best === null) {
      best = candidate;
      continue;
    }
    if (candidate.match.score > best.match.score) {
      best = candidate;
      continue;
    }
    if (
      candidate.match.score === best.match.score &&
      FIELD_RANK[candidate.field] < FIELD_RANK[best.field]
    ) {
      best = candidate;
    }
  }
  return best;
}

/** 单个 token 在一条任务里的最佳命中（受 scope 限制） */
function bestForTaskToken(
  task: Task,
  token: string,
  contextNameById: Map<string, string>,
  scope: SearchScope,
): Candidate | null {
  const candidates: Candidate[] = [];

  if (scope !== "notes") {
    const title = matchTitle(task.title, token);
    if (title !== null) candidates.push({ field: "title", match: title });
  }

  if (scope !== "title") {
    const notes = matchContains(task.notes, token, 30);
    if (notes !== null) candidates.push({ field: "notes", match: notes });

    for (const tag of task.tags) {
      const tagMatch = matchContains(tag, token, 25);
      if (tagMatch !== null) {
        candidates.push({ field: "tag", match: tagMatch });
        break;
      }
    }

    for (const contextId of task.contextIds) {
      const name = contextNameById.get(contextId);
      if (name === undefined) continue;
      const contextMatch = matchContains(name, token, 25);
      if (contextMatch !== null) {
        candidates.push({ field: "context", match: contextMatch });
        break;
      }
    }
  }

  return pickBest(candidates);
}

/**
 * 多 token 汇总：
 * - 任一词不命中 → 整条不命中（AND 语义）；
 * - 总分取各词最低分（最弱的那个词决定相关性，避免长尾词被强词掩盖）；
 * - matchedField 取层级最靠前的字段（标题优先），便于 UI 说明"命中在哪"；
 * - 摘要围绕**第一个词**的命中位置（用户最先输入的那个词）。
 */
function combineTokenMatches(perToken: Candidate[]): Candidate | null {
  if (perToken.length === 0) return null;
  let weakest = perToken[0] as Candidate;
  let primary = perToken[0] as Candidate;
  for (const candidate of perToken) {
    if (candidate.match.score < weakest.match.score) weakest = candidate;
    if (FIELD_RANK[candidate.field] < FIELD_RANK[primary.field]) primary = candidate;
  }
  return { field: primary.field, match: { ...weakest.match, index: perToken[0]!.match.index, text: perToken[0]!.match.text } };
}

function matchTask(
  task: Task,
  tokens: string[],
  contextNameById: Map<string, string>,
  scope: SearchScope,
): SearchHit | null {
  const perToken: Candidate[] = [];
  for (const token of tokens) {
    const best = bestForTaskToken(task, token, contextNameById, scope);
    if (best === null) return null;
    perToken.push(best);
  }
  const combined = combineTokenMatches(perToken);
  if (combined === null) return null;

  return {
    id: task.id,
    kind: "task",
    title: task.title,
    snippet: snippetAround(combined.match.text, combined.match.index, (tokens[0] ?? "").length),
    score: combined.match.score,
    matchedField: combined.field,
  };
}

function matchProject(project: Project, tokens: string[], scope: SearchScope): SearchHit | null {
  const perToken: Candidate[] = [];
  for (const token of tokens) {
    const candidates: Candidate[] = [];
    if (scope !== "notes") {
      const title = matchTitle(project.name, token);
      if (title !== null) candidates.push({ field: "title", match: title });
    }
    if (scope !== "title") {
      const notes = matchContains(project.description, token, 30);
      if (notes !== null) candidates.push({ field: "notes", match: notes });
    }
    const best = pickBest(candidates);
    if (best === null) return null;
    perToken.push(best);
  }
  const combined = combineTokenMatches(perToken);
  if (combined === null) return null;
  return {
    id: project.id,
    kind: "project",
    title: project.name,
    snippet: snippetAround(combined.match.text, combined.match.index, (tokens[0] ?? "").length),
    score: combined.match.score,
    matchedField: combined.field,
  };
}

function compareHits(
  a: SearchHit,
  b: SearchHit,
  updatedAtOf: (id: string) => number,
): number {
  if (a.score !== b.score) return b.score - a.score;
  const updatedA = updatedAtOf(a.id);
  const updatedB = updatedAtOf(b.id);
  if (updatedA !== updatedB) return updatedB - updatedA;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 搜索全部未删除任务（含已完成，便于回溯）与未删除项目。
 * `now` 预留给后续时效加权；当前评分完全由匹配层级决定，保持接口稳定。
 */
export function searchAll(
  state: AppState,
  query: string,
  now: number,
  options?: SearchOptions,
): SearchResult {
  void now;
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return { tasks: [], projects: [], total: 0 };
  const scope = options?.scope ?? "all";

  const contextNameById = new Map<string, string>();
  for (const context of Object.values(state.contexts)) {
    if (context.deletedAt === null) contextNameById.set(context.id, context.name);
  }

  // 先用倒排索引把"全库扫描"缩成"候选集验证"；索引只是预筛，
  // 最终仍由 matchTask 用 indexOf 精确判定（不会漏召回）。
  const index = getIndex(state);
  const candidates = candidateIds(state, index, contextNameById, tokens);
  const candidateTasks: Task[] =
    candidates === null
      ? Object.values(state.tasks)
      : [...candidates]
          .map((id) => state.tasks[id])
          .filter((task): task is Task => task !== undefined);

  const taskHits: SearchHit[] = [];
  for (const task of candidateTasks) {
    if (task.deletedAt !== null) continue;
    const hit = matchTask(task, tokens, contextNameById, scope);
    if (hit !== null) taskHits.push(hit);
  }

  const projectHits: SearchHit[] = [];
  for (const project of Object.values(state.projects)) {
    if (project.deletedAt !== null) continue;
    const hit = matchProject(project, tokens, scope);
    if (hit !== null) projectHits.push(hit);
  }

  taskHits.sort((a, b) => compareHits(a, b, (id) => state.tasks[id]?.updatedAt ?? 0));
  projectHits.sort((a, b) => compareHits(a, b, (id) => state.projects[id]?.updatedAt ?? 0));

  return {
    tasks: taskHits,
    projects: projectHits,
    total: taskHits.length + projectHits.length,
  };
}

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
 */

export type SearchHitKind = "task" | "project";
export type SearchMatchedField = "title" | "notes" | "tag" | "context";

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

const FIELD_RANK: Record<SearchMatchedField, number> = {
  title: 0,
  notes: 1,
  tag: 2,
  context: 3,
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function lower(value: string): string {
  return value.toLowerCase();
}

interface FieldMatch {
  score: number;
  index: number;
  text: string;
}

function matchTitle(text: string, query: string): FieldMatch | null {
  const hay = lower(text);
  const needle = lower(query);
  const index = hay.indexOf(needle);
  if (index < 0) return null;
  if (hay === needle) return { score: 100, index: 0, text };
  if (index === 0) return { score: 70, index: 0, text };
  return { score: 50, index, text };
}

function matchContains(text: string, query: string, score: number): FieldMatch | null {
  const index = lower(text).indexOf(lower(query));
  return index < 0 ? null : { score, index, text };
}

/** 命中位置前后各 20 字，压掉换行/连续空白 */
function snippetAround(text: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + queryLength + SNIPPET_RADIUS);
  return collapseWhitespace(text.slice(start, end));
}

function pickBest(
  candidates: { field: SearchMatchedField; match: FieldMatch }[],
): { field: SearchMatchedField; match: FieldMatch } | null {
  let best: { field: SearchMatchedField; match: FieldMatch } | null = null;
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

function matchTask(
  task: Task,
  query: string,
  contextNameById: Map<string, string>,
): SearchHit | null {
  const candidates: { field: SearchMatchedField; match: FieldMatch }[] = [];

  const title = matchTitle(task.title, query);
  if (title !== null) candidates.push({ field: "title", match: title });

  const notes = matchContains(task.notes, query, 30);
  if (notes !== null) candidates.push({ field: "notes", match: notes });

  for (const tag of task.tags) {
    const tagMatch = matchContains(tag, query, 25);
    if (tagMatch !== null) {
      candidates.push({ field: "tag", match: tagMatch });
      break;
    }
  }

  for (const contextId of task.contextIds) {
    const name = contextNameById.get(contextId);
    if (name === undefined) continue;
    const contextMatch = matchContains(name, query, 25);
    if (contextMatch !== null) {
      candidates.push({ field: "context", match: contextMatch });
      break;
    }
  }

  const best = pickBest(candidates);
  if (best === null) return null;

  return {
    id: task.id,
    kind: "task",
    title: task.title,
    snippet: snippetAround(best.match.text, best.match.index, query.length),
    score: best.match.score,
    matchedField: best.field,
  };
}

function matchProject(project: Project, query: string): SearchHit | null {
  const title = matchTitle(project.name, query);
  const notes = matchContains(project.description, query, 30);
  const best = pickBest([
    ...(title !== null ? [{ field: "title" as const, match: title }] : []),
    ...(notes !== null ? [{ field: "notes" as const, match: notes }] : []),
  ]);
  if (best === null) return null;
  return {
    id: project.id,
    kind: "project",
    title: project.name,
    snippet: snippetAround(best.match.text, best.match.index, query.length),
    score: best.match.score,
    matchedField: best.field,
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
export function searchAll(state: AppState, query: string, now: number): SearchResult {
  void now;
  const needle = query.trim();
  if (needle.length === 0) return { tasks: [], projects: [], total: 0 };

  const contextNameById = new Map<string, string>();
  for (const context of Object.values(state.contexts)) {
    if (context.deletedAt === null) contextNameById.set(context.id, context.name);
  }

  const taskHits: SearchHit[] = [];
  for (const task of Object.values(state.tasks)) {
    if (task.deletedAt !== null) continue;
    const hit = matchTask(task, needle, contextNameById);
    if (hit !== null) taskHits.push(hit);
  }

  const projectHits: SearchHit[] = [];
  for (const project of Object.values(state.projects)) {
    if (project.deletedAt !== null) continue;
    const hit = matchProject(project, needle);
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

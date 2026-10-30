import { useCallback, useMemo } from "react";
import { runCommand } from "@gtd/core";
import { showPrompt, t, useAppStore } from "@gtd/ui";

/**
 * 保存的筛选（Perspective）：存 kv["filters.saved"]（JSON），不同步，
 * 与语言/主题一样属于本机偏好。
 *
 * 结构刻意保持扁平（query/contextId/tag/overdueOnly），新增筛选维度时
 * 旧记录仍可解析——缺字段按"未启用"处理。
 */
export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  contextId: string | null;
  tag: string | null;
  overdueOnly: boolean;
}

const KV_KEY = "filters.saved";

/** 解析 kv 中的 JSON；任何损坏都退化为空列表，不让筛选功能拖垮启动 */
export function parseSavedFilters(raw: unknown): SavedFilter[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): SavedFilter[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.name !== "string") return [];
      return [
        {
          id: record.id,
          name: record.name,
          query: typeof record.query === "string" ? record.query : "",
          contextId: typeof record.contextId === "string" ? record.contextId : null,
          tag: typeof record.tag === "string" ? record.tag : null,
          overdueOnly: record.overdueOnly === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

async function persist(entries: SavedFilter[]): Promise<void> {
  await runCommand("settings.set", { key: KV_KEY, value: JSON.stringify(entries) }).catch(
    () => undefined,
  );
}

/** 当前筛选是否为空（空筛选没有保存价值） */
export function isFilterEmpty(filter: Omit<SavedFilter, "id" | "name">): boolean {
  return (
    filter.query.trim() === "" && filter.contextId === null && filter.tag === null && !filter.overdueOnly
  );
}

export interface UsePerspectivesResult {
  perspectives: SavedFilter[];
  saveCurrent: (filter: Omit<SavedFilter, "id" | "name">) => Promise<SavedFilter | null>;
  remove: (id: string) => Promise<void>;
}

/** 读写 kv 里的保存筛选；kv 变化经 store 驱动重渲染 */
export function usePerspectives(): UsePerspectivesResult {
  const raw = useAppStore((state) => state.kv[KV_KEY]);
  const perspectives = useMemo(() => parseSavedFilters(raw), [raw]);

  const saveCurrent = useCallback(
    async (filter: Omit<SavedFilter, "id" | "name">): Promise<SavedFilter | null> => {
      if (isFilterEmpty(filter)) return null;
      const name = await showPrompt({
        title: t("perspective.save"),
        placeholder: t("perspective.namePlaceholder"),
        validate: (value) => (value.trim().length === 0 ? t("perspective.namePlaceholder") : null),
      });
      if (name === null || name.trim() === "") return null;
      const entry: SavedFilter = {
        id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim().slice(0, 24),
        ...filter,
      };
      const next = [...perspectives, entry].slice(0, 20);
      await persist(next);
      return entry;
    },
    [perspectives],
  );

  const remove = useCallback(
    async (id: string) => {
      await persist(perspectives.filter((entry) => entry.id !== id));
    },
    [perspectives],
  );

  return { perspectives, saveCurrent, remove };
}

import type { Area, Project } from "../../models/task";
import type { AppState } from "../app-store";

/** 项目 / 区域 / 情境等组织维度的选择器（纯函数）。 */

export function selectActiveProjects(state: AppState): Project[] {
  return Object.values(state.projects)
    .filter((project) => project.deletedAt === null && project.status === "active")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function selectContexts(state: AppState) {
  return Object.values(state.contexts)
    .filter((context) => context.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** 区域列表 */
export function selectAreas(state: AppState): Area[] {
  return Object.values(state.areas)
    .filter((area) => area.deletedAt === null)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
}

/**
 * 按区域分组活跃项目；未归类的进 null 组（殿后）。
 * 纯数组入参版：React 侧应配 useMemo 使用（见下 selectProjectsByArea 的注意）。
 */
export function groupProjectsByArea(
  areas: Area[],
  projects: Project[],
  allAreas: Record<string, Area>,
): { area: Area | null; projects: Project[] }[] {
  const groups = areas.map((area) => ({
    area,
    projects: projects.filter((project) => project.areaId === area.id),
  }));
  const loose = projects.filter((project) => {
    if (project.areaId === null) return true;
    const area = allAreas[project.areaId];
    // 区域被删（墓碑）或缺失时，项目回落未分组，不能凭空消失
    return area === undefined || area.deletedAt !== null;
  });
  return [...groups, { area: null, projects: loose }].filter(
    (group) => group.projects.length > 0 || group.area !== null,
  );
}

/**
 * 按区域分组的活跃项目（state 版，测试/一次性调用用）。
 * ⚠️ 不要直接传给 useAppStore/useShallow：每次调用都返回新的分组对象，
 * 浅比较恒不相等会触发 React "Maximum update depth exceeded"（#185）。
 * React 里请用 selectAreas + selectActiveProjects + groupProjectsByArea + useMemo。
 */
export function selectProjectsByArea(
  state: AppState,
): { area: Area | null; projects: Project[] }[] {
  return groupProjectsByArea(selectAreas(state), selectActiveProjects(state), state.areas);
}

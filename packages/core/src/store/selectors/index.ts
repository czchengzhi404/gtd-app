/**
 * selectors barrel。
 *
 * `store/selectors.ts` 保留为转发文件（既有 import 不受影响）；
 * 直接依赖本目录的新代码可按域导入：
 * - time.ts      日期边界 / 排序 / defer 判定
 * - tasks.ts     任务视图
 * - projects.ts  项目 / 区域 / 情境分组（含 React #185 警告）
 * - filters.ts   搜索 / 筛选
 */
export * from "./time";
export * from "./tasks";
export * from "./projects";
export * from "./filters";

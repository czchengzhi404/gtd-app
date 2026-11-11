/**
 * 项目强调色：由项目 id 派生，**不改数据模型**。
 *
 * 为什么不做成用户可选的颜色：那要给 projects 表加字段、写迁移、改同步的
 * 字段合并策略，成本远大于收益。而「一眼区分两个项目」这个需求，
 * 派生一个稳定颜色就够——同一个项目在任何设备、任何时候都是同一个色。
 *
 * 取色原则：
 * - 全部 700 级饱和度，白底和深色底（canvas #0E1013）上都能看清
 * - 六色循环，够区分常见项目数量；同名不同 id 也不会撞成一片
 */

const PROJECT_ACCENTS = [
  "#1D4ED8", // 蓝（与应用主色同源，作为默认基调）
  "#0E7C66", // 墨绿
  "#B45309", // 赭石
  "#7C3AED", // 紫
  "#BE123C", // 玫红
  "#4D7C0F", // 橄榄
] as const;

/** 稳定的字符串散列（FNV-1a 变体，纯 JS，不依赖平台） */
export function projectAccent(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return PROJECT_ACCENTS[hash % PROJECT_ACCENTS.length]!;
}

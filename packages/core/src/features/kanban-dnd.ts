/**
 * 看板拖拽的落点计算（纯函数，无 React 依赖，便于单测）。
 *
 * 设计：拖拽时只跟踪卡片中心点的屏幕坐标；列容器在布局阶段上报自己的
 * x 区间。松手时用中心点命中哪一列来决定目标状态——比"位移阈值"更稳定，
 * 也不依赖手势库的 velocity。
 */

export interface ColumnRect {
  key: string;
  /** 列容器左边界（屏幕坐标） */
  x: number;
  width: number;
}

/** 命中测试：返回中心点所在列的 key；落在所有列之外时返回 null */
export function hitColumn(rects: ColumnRect[], centerX: number): string | null {
  for (const rect of rects) {
    if (centerX >= rect.x && centerX <= rect.x + rect.width) return rect.key;
  }
  return null;
}

/**
 * 判定一次拖放是否应触发状态变更：
 * - 目标列必须存在且与来源不同
 * - 目标列必须是任务可落入的状态列（看板只展示四个非 done 状态）
 */
export function resolveDrop(
  sourceKey: string,
  centerX: number,
  rects: ColumnRect[],
): string | null {
  const target = hitColumn(rects, centerX);
  if (target === null || target === sourceKey) return null;
  return target;
}

/** 拖拽位移是否已达"开始拖拽"的阈值（避免误触） */
export function exceedsDragThreshold(dx: number, dy: number, threshold = 6): boolean {
  return Math.abs(dx) > threshold || Math.abs(dy) > threshold;
}

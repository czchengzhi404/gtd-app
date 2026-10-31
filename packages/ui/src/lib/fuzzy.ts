/**
 * 命令面板的模糊打分（纯函数，无 React/RN 依赖，可单测）。
 *
 * 打分序：全等 100 > 前缀 80 > 包含 60 > 子序列 30 > 不匹配 0。
 * 大小写不敏感；空 query 一律 1（显示全部候选）。
 */
export function fuzzyScore(text: string, query: string): number {
  const hay = text.toLowerCase();
  const q = query.toLowerCase();
  if (q.length === 0) return 1;
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 80;
  if (hay.includes(q)) return 60;
  // 子序列（fuzzy）
  let i = 0;
  for (const ch of hay) {
    if (ch === q[i]) i++;
    if (i === q.length) return 30;
  }
  return 0;
}

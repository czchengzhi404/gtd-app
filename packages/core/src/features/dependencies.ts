/**
 * 先后关系（前置依赖）的纯逻辑：防环与解析。
 *
 * 为什么必须有防环：`blockedBy` 是「我要等谁」。一旦形成环
 * （A 等 B、B 等 A），两个任务会永远互为未完成前置，
 * 于是**永远不可做**——它们会静默地从首屏消失，用户只会觉得「东西丢了」。
 *
 * 参考 NextTodo 的 `graph.ts`：它的表结构是独立的 before/after 边表，
 * 用 Kahn 拓扑排序去掉冗余边；我们存在任务上，所以改在写入前做可达性检查。
 */
import type { Task } from "../models/task";

/**
 * 如果让 `taskId` 依赖 `prereqId`，会不会形成环？
 *
 * 判据：从 `prereqId` 出发，沿着「它等谁」一路走下去，
 * 如果走回了 `taskId`，说明加这条边会成环。
 * 另外自己等自己直接算环。
 */
export function wouldCreateCycle(
  tasks: readonly Task[],
  taskId: string,
  prereqId: string,
): boolean {
  if (taskId === prereqId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [prereqId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const node = byId.get(current);
    if (node === undefined) continue;
    for (const next of node.blockedBy ?? []) stack.push(next);
  }
  return false;
}

/**
 * 过滤出「可以作为前置」的候选：排除自己、排除会造成环的。
 * 已完成的也可以选（作为「我确实等过它」的记录），但会排在后面。
 */
export function prereqCandidates(
  tasks: readonly Task[],
  taskId: string,
): Task[] {
  return tasks
    .filter((t) => t.id !== taskId && t.deletedAt === null)
    .filter((t) => !wouldCreateCycle(tasks, taskId, t.id))
    .sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;
    });
}

/**
 * 解析出「还挡着我的」前置（未完成且未删除）。
 * 首屏与任务详情都用它，保证两处口径一致。
 */
export function unresolvedPrereqs(task: Task, tasks: readonly Task[]): Task[] {
  const ids = new Set((task.blockedBy ?? []).map(String));
  if (ids.size === 0) return [];
  return tasks.filter(
    (t) => ids.has(t.id) && t.deletedAt === null && t.status !== "done",
  );
}

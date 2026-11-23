# 全仓逻辑审计（2026-11-23）

> **状态：6 项缺陷已全部修复，并补了回归测试**（`packages/core/src/__tests__/audit-regressions.test.ts`、`apps/desktop/tests/commands.test.ts`）。
> 修复要点：`coerce` 统一 `normalizeRecurrence`（保留 `byWeekday`、兼容字符串数字）；`weekly` 增加 `originAt` 稳定起点；`task.uncomplete` 支持 `restore` 快照（单条撤销与批量撤销都带）；`next-action` 把「已删除前置」视为满足；`review` 与 `stats` 共用 `completionTime`。
> 探针 `bun bench/audit-logic-probe.mjs` 现输出 `确认缺陷 0/6 项`。

范围：`packages/core`（93 文件 / 11,188 行）、`packages/ui`（64 / 11,110）、`apps/mobile`（65 / 9,678）、`apps/desktop`（10 / 1,199），共约 3.3 万行源码、45 个测试文件。

方法与边界：逐文件读取高风险纯逻辑（时间推进、依赖图、撤销、归一化、合并、统计口径），为每个可疑点写可执行探针在真实运行时下复现；**未**做穷举式形式化验证，也**未**在真机/多设备上验证同步时序类问题。

复跑全部结论：`bun bench/audit-logic-probe.mjs`（6/6 复现，退出码 1）。

---

## 一、确认缺陷（按严重度）

### P0-1 同步与备份恢复会永久丢失「每周多日」规则

- 位置：`packages/core/src/db/coerce.ts:138`
- 代码：`asStringArray(r.byWeekday)` —— `byWeekday` 是**数字数组**，`asStringArray` 只保留字符串，恒返回 `[]`，于是 `length > 0` 为假，`byWeekday` 被置为 `undefined`。
- 影响面：`coerceTaggedRecords` 被 `db/commands/shared.ts:240`（同步接收端）与备份导入共同调用。任何带「每周一三」规则的任务，一旦经过同步或备份恢复，就退化成「每周（锚点那天）」，且**无任何报错**。
- 佐证：同文件 `asRecurrence`（模板路径）用的是正确写法 `filter(typeof x === "number" && Number.isInteger(x) && 0<=x<=6)`，两处实现不一致。
- 复现：输入 `byWeekday:[1,3]` → 输出 `undefined`。

### P0-2 `task.uncomplete` 丢失原状态（撤销把任务搬到另一个清单）

- 位置：`packages/core/src/db/commands/task.ts:181`
- 代码：`status: existing.projectId ? "next" : "inbox"`
- 影响：`waiting` / `someday` / `next` 任务被完成后撤销，一律落到 `inbox`（或 `next`）。用户看到的「撤销」不是逆操作，任务从「等待中」跳到「收集箱」。批量完成/删除的撤销路径（`planBulkComplete`）全部经过这里。
- 复现：`waiting` → complete → uncomplete，状态变为 `inbox`。

### P0-3 重复任务撤销后到期日不回退

- 位置：`packages/core/src/db/commands/task.ts:141-151`（完成时推进）与 `:176-188`（撤销时不还原）
- 影响：`task.complete` 对重复任务把 `dueAt` 推进到下一次出现、并写 `lastCompletedAt`；`task.uncomplete` 只清 `completedAt` 并改状态，**不还原 `dueAt`、也不清 `lastCompletedAt`**。用户撤销一次误勾，节奏已被永久提前一天（或一个周期），且完成记录仍计入统计。
- 复现：`dueAt=10/25` → 完成 → 撤销 → `dueAt=10/26`。

### P1-4 软删前置会让依赖任务在首屏永久消失，且两处口径矛盾

- 位置：`packages/core/src/features/next-action.ts:53` 与 `features/dependencies.ts:68`
- 代码：
  - `next-action`：`waiting = prereqs.some((id) => !doneIds.has(id))`，`doneIds` 只含「已完成且未删除」。
  - `unresolvedPrereqs`：显式过滤 `deletedAt === null`，删除的前置**不算**挡着。
- 影响：删掉一个前置（不是完成它）后，依赖它的任务在「现在」页被判定为永远被挡住（不计入可做、静默消失），而任务详情页显示「没有未完成前置」。两个视图互相矛盾，用户会认为任务丢了。
- 复现：前置 `deletedAt != null` → 首屏 `next=null, blockedCount=1`，详情 `unresolvedPrereqs=[]`。

### P1-5 回顾页与统计页的「完成数」口径不一致

- 位置：`packages/core/src/features/review.ts:53`（只认 `completedAt`）与 `features/stats.ts:56-59`（`completedAt ?? lastCompletedAt`）
- 影响：重复任务完成时 `completedAt` 被置空、只留 `lastCompletedAt`。于是同一份数据，统计页 7 天完成 1 件，回顾页显示 0 件；回顾页的「8 周完成趋势」同样漏掉全部重复任务。
- 复现：`review.completedLastWeek=0` 而 `stats.completed7d=1`。

### P2-6 `freq: "weekly"` 的 `interval > 1` 完全失效

- 位置：`packages/core/src/features/recurrence.ts:82`（及 `sameWeekdayCycle` `:147-150`）
- 代码：判定条件为 `weekdays.includes(weekday) && day > floor && (interval === 1 || inCycle || sameWeekdayCycle(...))`。而 `sameWeekdayCycle` 的返回值包含 `weekdays.includes(weekday)`，外层已保证该条为真，于是第三个 `||` 分支恒真，`interval` 被短路。
- 影响：`每两周` / `双周` / `biweekly`（`quick-add.ts:167-171` 明确会生成 `interval: 2`）实际按每周触发，任务频率翻倍。数据与 UI 都自称「每两周」，只有行为不是。
- 复现：`interval=2` 与 `interval=1` 输出完全相同的日期序列。

---

## 二、检查后未发现问题的高风险区（供复核）

- `sync/merge.ts`、`sync/fieldmerge.ts`：LWW 三级决胜、3-way 逐字段合并、冲突保留本地，与注释一致；`TASK_MERGE_FIELDS` 覆盖 `Task` 全部 18 个字段，无遗漏。
- `features/dependencies.ts` 防环（DFS + seen 集）、`wouldCreateCycle` 自环判定正确。
- `features/search.ts`：倒排索引只是预筛，最终仍 `indexOf` 精确验证；多词 AND、scope、摘要定位逻辑自洽。
- `features/matrix.ts` 四象限判定、`features/clarify.ts` 决策树优先级、`features/stats.ts` 日桶与 streak 计算。
- `features/bulk-ops.ts`：`deferTargetTime` 的「下周一」边界（周日/周一/周二）逐值核对正确。
- `db/coerce.ts` 除 `byWeekday` 外的类型收敛（状态/优先级白名单、长度截断、revision 下限）。
- `store/selectors/*`：`defer` 过滤、`byOrder` 稳定性、`getAllTasks` 的 WeakMap 缓存语义。
- `packages/ui/src/hooks/useBreakpoint.ts` 断点边界（375/768/1024/1440）。

## 三、未覆盖 / 未能验证

- 真机（ARM64）、iOS、平板与折叠屏下的布局与交互逻辑。
- 多设备并发同步的时序竞态（本次只审了合并算法本身，未做双设备并发压测）。
- Electron 主进程与平台桥（`apps/desktop/src`、`apps/mobile/src/platform`）的文件/通知/权限分支，仅做了静态阅读，未跑设备级验证。
- 未做穷举输入空间的性质测试（如 `nextOccurrence` 在跨 DST 时区的行为：`daily` 用固定 24h 推进，在有夏令时的时区会漂移一小时——中国时区不触发）。

## 四、修复建议（未实施）

1. `coerce.ts` 改用与 `asRecurrence` 相同的数字数组校验，并抽成单一 `asWeekdayArray` 供两处复用。
2. `task.complete` 在推进重复任务前把「完成前的 `dueAt`/`lastCompletedAt`/`status`」写入撤销栈（或新增 `task.uncomplete` 的可选还原参数），让撤销成为真正的逆操作；非重复任务同样记录完成前 `status`。
3. `next-action` 判定改为与 `unresolvedPrereqs` 同口径：`deletedAt !== null` 的前置视为已满足。
4. `review.ts` 统一复用 `stats.ts` 的 `completionTime`（`completedAt ?? lastCompletedAt`）。
5. `recurrence.ts` 的 weekly 去掉恒真的第三个 `||` 分支，改为按 `weekIndex - anchorWeekIndex` 对 `interval` 取模判定。

以上 1、5 是纯逻辑修正且不影响 UI；2、3、4 会改变用户可见行为（撤销落点、首屏可见性、回顾数字），建议修完后各补一条回归测试再发版。

# v2.7.26 · 前置点击诊断（只加日志，不改行为）

## 为什么发这一版

v2.7.25 把前置候选改成内联展开后，设备验证仍是 **4/6**：
候选能展开、能点，但点了之后前置 chip 不出现，也没有任何 toast。

已排除：zod schema、`SQL_UPDATE_TASK`、命令层（`task-update-blockedby.test.ts`
用内存 SQLite 证明 `blockedBy` 能往返）、弹层触摸、回调未调用
（列表从 `Close` 变回 `Add prerequisite` 证明 `addPrereq` 执行了）。

剩下三种可能，只能靠日志区分：

| logcat 结果 | 结论 |
|---|---|
| `[dep] ok records=1` 但无 chip | `applyRecords` → 页面重渲染链路问题 |
| `[dep] fail <错误>` | 命令抛错，按错误信息定位 |
| 只有 `[dep] add prereq`，后面什么都没有 | `getCommandPort().dispatch` 挂起，查 `createExpoExecutor` 的 `enqueue` 队列 |

## 改了什么

`apps/mobile/src/app/task/[id].tsx` 的 `addPrereq`：
- 入口 `console.warn("[dep] add prereq …")`
- `.then()` 里 `[dep] ok records=N`
- `.catch()` 里 `[dep] fail <message>`

**不改任何业务逻辑、不改 UI、不改数据层。** 这一版纯粹是为了在 release 包上
拿到确定性证据，避免在猜测上继续发版。

## logcat 结论（已拿到）

```
W ReactNativeJS: [dep] add prereq task=01a1d96d-… prereq=01a1d96e-…
W ReactNativeJS: [dep] ok records=1
```

**`runCommand` 成功返回 1 条记录，没有 `[dep] fail`。**
所以命令层完全正常，与此前内存 SQLite 集成测试的结论一致。

进一步用 `bench/probe-dependency-root.mjs` 验证「退出详情页再重新进入」：
重进后**仍显示 "No prerequisites"** → 不是 stale 渲染，
是 `applyRecords` 之后 store 里这条 task 的 `blockedBy` 仍为空。

## 已逐层排除（全部有确定性证据）

| 层 | 证据 |
|---|---|
| zod `patch.blockedBy` | `bench/probe-zod-blockedby.mjs`：`parse` 后保留 `["prereq-1"]` |
| `task.update` handler | `blockedBy: patch.blockedBy ?? existing.blockedBy` |
| `tagTask` | 直接返回整个 task，不裁字段 |
| `executeCommand` | 原样返回 handler 的 records |
| `task.update` 命令链 | `task-update-blockedby.test.ts` 内存 SQLite 往返通过 |
| 弹层触摸 | 已改内联，回调确实执行（列表收起 + `[dep] add prereq` 日志） |
| 异步时序 | 等 6 秒、重进详情页都无效 |
| stale 渲染 | 重新挂载详情页仍无 chip |

**剩余未定位环节**：`applyRecords` 收到 record 后 store 里的值，
或 `task/[id].tsx` 里 `prereqs` 的派生（它用了
`Object.values(appStore.getState().tasks)` 这个非响应式快照来查前置标题）。

> 注意：`task/[id].tsx` 第 80 行 `const allTasks = Object.values(appStore.getState().tasks)`
> 是**命令式快照**，不是 hook。虽然 `prereqs` 的第一手数据来自响应式的 `task.blockedBy`，
> 但 `allTasks.find(...)` 用的是渲染那一刻的快照。这处写法本身就有问题，
> 下一版应改成 `useAppStore((s) => s.tasks)` 并用 `useMemo` 派生。

## 当前状态（如实）

- 数据层、`pickNextAction()`、防环纯函数、`NowView` 首屏：**可靠**
- 「在 UI 上设置前置」：**设备上仍不生效**，是已知未解决缺口
- 诊断日志保留在源码里，方便下一轮直接在 store 层打点定位

**不再继续发猜测版本。** 这是本轮收尾。

## 验证

- `tsc`（core / ui / mobile）全通过
- `bun test` **518 项 / 44 文件全绿**

## 升级

- versionCode 59 → 60，同一签名

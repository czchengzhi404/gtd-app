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

## 验证

- `tsc`（ui / mobile）通过
- `bun test` 全绿
- logcat 结论：本版补充

## 升级

- versionCode 59 → 60，同一签名

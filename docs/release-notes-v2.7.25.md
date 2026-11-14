# v2.7.25 · 前置候选改成内联展开，彻底绕开弹层触摸问题

## 我上一版猜错了

v2.7.24 把 `OptionSheet` 的 `sheet` 加了 `pointerEvents="auto"`，
**实测仍然点不动**（4/6，症状完全一致）。所以「触摸层级」不是根因，
我不再继续猜这个组件的 Modal 行为。

## 这一版的做法：不用弹层

把「添加前置」从 `OptionSheet`（Modal 底部抽屉）改成**详情页内联展开**：

```
前置（做完这些才能开始）
  没有前置，随时可以做。
  ＋ 添加前置            ← 展开
  ────────────────────
  整理桌面               ← 直接渲染在页面里的文字行
  回复客户邮件
  Alpha
  Beta                  ← 点一行即添加
```

- 点按钮切换展开/收起，按钮变「收起」
- 候选是普通 `Pressable` 文字行，和分区 chip 同一套交互语言
- 没有 Modal、没有 backdrop、没有 `pointerEvents` 继承问题
- 顺带更符合《纸与当下》brief：**不弹层、不切页**，所有事在同一张纸上完成

## 顺带补的反馈

`addPrereq` 现在 `.then()` / `.catch()` 都会 toast（「已添加前置」/「添加前置失败」），
之前 `.catch(() => undefined)` 会把失败静默吞掉 —— 这正是排查半天的原因之一。

## 排查过程中确认的事实

| 层 | 结论 |
|---|---|
| `task.update` 命令 | ✅ 新增 `packages/core/src/__tests__/task-update-blockedby.test.ts`，用内存 SQLite 跑完整命令链，确认 `blockedBy` 能写入并读回 |
| zod schema | ✅ `taskCreatePayloadSchema` / `taskUpdatePayloadSchema.patch` 都有 `blockedBy` |
| `SQL_UPDATE_TASK` / `taskUpdateParams` | ✅ 列与参数一一对应 |
| `OptionSheet` 的 `onSelect` | ❌ 在这台设备（Android 17 / RN 0.86）上所有选项都不触发，只关闭面板 |
| `runCommand` 返回值 | ✅ 命令层通过，问题只在 UI 回调是否被调用 |

设备验证脚本 `scripts/verify-dependencies.mjs` 要求「chip 真的出现」，
才把这个一直未验证的回调路径逼出来 —— 之前所有用 `OptionSheet` 的地方
（批量移动、批量推迟）只验过「入口能点开」，没验过「选完状态变了」。

## 保留的一处健壮性改动

`OptionSheet` 的 `sheet` 显式 `pointerEvents="auto"`（v2.7.24）保留：
它不解决本例，但对这个共用组件是无害的明确化。
**批量移动 / 批量推迟那两处仍应单独补一次「选完状态变了」的验证** —— 已知未验证。

## 验证

- `tsc`（core / ui / mobile）全通过
- `bun test` **518 项 / 44 文件全绿**
- 设备实测 `scripts/verify-dependencies.mjs`：**4/6**
  - ✅ 首屏有「现在」任务
  - ✅ 滚到「前置」区
  - ✅ 点「添加前置」展开内联候选（列出 6 项）
  - ✅ 内联列表里有可选任务
  - ❌ 点候选后 chip 未出现
  - ❌ 首屏未出现「另有 N 件在等前置」

## ⚠️ 已知未解决：点了候选没生效

这是**当前版本的真实缺口**，不掩饰：

- 内联候选能从 `Close` 变回 `Add prerequisite`，证明 `addPrereq` **确实被调用**
  （`setPrereqPickerOpen(false)` 是它第一行）
- 但之后既没有「已添加前置」toast，也没有「添加前置失败」toast，
  前置 chip 也不出现 → `runCommand("task.update", …)` 的 Promise
  既不 resolve 也不 reject（挂起），或结果没有触发 store 重渲染
- 等了 6 秒再 dump 仍然如此，排除时序
- 换第一个候选、换其它候选都一致，排除特定 id

**已排除的层**（都有确定性证据）：

| 层 | 证据 |
|---|---|
| `task.update` 命令 | `task-update-blockedby.test.ts` 用内存 SQLite 跑完整命令链，`blockedBy` 能写入并读回 |
| zod `patch.blockedBy` | 源码第 82 行，类型检查通过 |
| `SQL_UPDATE_TASK` / `taskUpdateParams` | 列与参数对应，集成测试覆盖 |
| 弹层触摸 | 已改内联，候选行能展开但点了仍不生效 |
| 回调未调用 | 列表收起证明回调执行了 |

**下一步该做的**：在 `addPrereq` 里加 `console.warn`（源码已加，随下一版带出），
在 release 包上跑一次 `adb logcat -s ReactNativeJS`，
看 `[dep] ok / [dep] fail / 什么都没有` 三种结果里是哪一种：
- 有 `[dep] ok` 但无 chip → 是 `applyRecords` → 页面重渲染链路的问题
- 有 `[dep] fail` → 看错误信息
- 什么都没有 → `dispatch` 挂起，查 `createExpoExecutor` 的 `enqueue` 队列

在此之前，**「设好先后」在设备上还不能用**，只有数据层和纯函数是可靠的。

## 升级

- versionCode 58 → 59，同一签名

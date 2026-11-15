# v2.7.28 · 找到真根因：10 个 core 文件从来没推到 GitHub

## 一句话

**v2.7.18 起的 `blockedBy` 数据层改动，有 10 个文件只存在于本地 `E:\gtd清单`，从没进入 GitHub 仓库。** CI 从 GitHub 构建，所以此前所有 APK 里的 zod schema 里没有 `patch.blockedBy`，会把它 strip 掉 —— 命令永远收不到前置字段。

## 决定性的日志（v2.7.27）

```
[dep] add prereq task=01a1dcb1-… prereq=01a1dcb2-…
[dep] ok records=1  returned=undefined  inStore=[]  selectedIdsWas=[]
```

- `records=1` → 命令执行成功
- `returned=undefined` → **返回的 record 里没有 `blockedBy`**
- `inStore=[]` → `normalizeTask` 补的默认值
- 退出重进详情页仍无 chip → 不是 stale 渲染

## 为什么此前所有排查都「对不上」

| 现象 | 原因 |
|---|---|
| 本地 519 项测试全绿 | 测的是**源码树**，含完整 `blockedBy` |
| 内存 SQLite 往返测试通过 | 同上，`executeCommand` 直接调本地源码 |
| `[dep] ok records=1` 命令成功 | 远端 `task.update` handler 会执行，只是 patch 里没有 `blockedBy` |
| zod 校验没报错 | 远端 schema 里压根没声明这个键，被静默 strip |
| `app-store.ts` 的 `normalizeTask` 在远端有效 | 它是 v2.7.19 单独推过的，所以「补成 []」的行为在 |
| `dependencies.ts` / `next-action.ts` 有效 | 它们是后来单独推过的 |

这个组合制造了「一半代码是新的、一半是旧的」的诡异症状。

## 根因链

发布流程 `bench/push-commit-via-api.mjs` 接受一个**显式文件列表**。
v2.7.18 那次推的 11 个文件全是 UI / 首屏相关，数据层的 10 个文件虽在本地改了，
**从未被列入任何一次推送清单**。之后每版只推当次改动的文件，没人回头核对全量。

## 修复

1. 新建 `bench/audit-remote-parity.mjs`：逐个比对源码树与远端文件内容
2. 一次性推送 10 个漏掉的文件：
   `models/commands.ts`、`models/task.ts`、`db/migrations.ts`、`db/coerce.ts`、
   `db/mappers.ts`、`db/commands/task.ts`、`db/commands/shared.ts`、
   `db/commands/templates.ts`、`features/exporters.ts`、`sync/fieldmerge.ts`
3. 复核：14/14 关键文件 `SAME`，`blockedBy` 在远端全部存在
4. 新建 `bench/audit-full-parity.mjs` 做全量审计：
   **207 个文本文件，差异 4 个** —— 3 个是版本号文件（`bump-version` 只在发布树跑，预期），
   1 个是 `fetch-release-apk.mjs` 的本地改进（已推）。**没有别的漏推源码。**
5. 本版让 CI 用**完整代码**首次构建

## 流程改进（防止再犯）

`audit-full-parity.mjs` 应纳入每次发布前的检查：
只要「源码树 ≠ 远端 main」的文件数超出「3 个版本号文件」，就停下来查。
这比任何单测都能更早发现「测的和发的不一样」。

## 前几版的猜测，如实留档

| 版本 | 当时的判断 | 实际 |
|---|---|---|
| v2.7.24 | `OptionSheet` 的 `pointerEvents` 导致点不动 | ❌ 猜错，改了无效 |
| v2.7.25 | 改内联展开能绕开弹层问题 | ❌ 症状相同 |
| v2.7.26 | 加日志定位「命令挂起 / store 派生」 | ✅ 日志证明命令成功但 record 缺字段，方向转对 |
| v2.7.27 | 响应式派生 + 打印 returned/inStore | ✅ `returned=undefined` 直接指向 schema |

那些猜测版的发布说明都保留了当时的记录，没有事后改写。

## 设备实测（v2.7.28，6/6 全通过）

```
[dep] add prereq task=01a1dcf8-… prereq=01a1dcf9-…
[dep] ok records=1 returned=["01a1dcf9-…"]     ← 字段终于不再丢

PASS  首屏有「现在」任务
PASS  滚到「前置」区
PASS  点「添加前置」展开内联候选
PASS  内联列表里有可选任务
PASS  前置 chip 出现在详情页（WAITING ON | Alpha）
PASS  首屏出现「另有 N 件在等前置完成」
```

关键因果：给「预约体检」加上未完成前置 Alpha 后，首屏
`7 left today` → **`6 left today`**，被挡住的任务从「现在」消失。
这正是 NextTodo「设好先后，只看现在能做的事」的核心行为。

日志在确认修复后已从 `addPrereq` 中移除，只保留成功/失败 toast。

## 顺带修的验证脚本坑

- 干扰 App（`com.workledger.app` 等）会抢前台 → 改用 `ensureForeground()`
- **不要用 `pm disable-user`**：它会把包置为 suspended，
  `pm enable` 解不开，之后启动只会得到 `App isn't available / managed by Shell`。
  已踩过，用 `pm unsuspend` 恢复，并写进 `docs/dev-env-runbook.md`
- `uiautomator dump` 在 `pm clear` 后偶发 137/255 → 加 `dumpSafe()` 重试

## 验证

- `tsc`（core / ui / mobile）全通过
- `bun test` **519 项 / 44 文件全绿**
- 远端 14/14 关键文件一致、全量 207 文件审计完成
- 设备实测 `scripts/verify-dependencies.mjs` **6/6**

## 升级

- versionCode 61 → 62，同一签名

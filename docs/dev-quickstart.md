# 开发者简易教程

> 目标：**30 分钟内能在本机跑起来、跟通一条完整调用链、并改出一个能验收的小功能。**
> 不需要先读完 `technical-reference.md`——那份是规范，这份是"上手"。
>
> 配套：功能与实现细节见 `features-implementation.md`；数据模型/命令规范见 `technical-reference.md`。

---

## 0. 前置

| 需要 | 版本 | 检查 |
|---|---|---|
| Bun | ≥ 1.3 | `bun --version` |
| Node | ≥ 20（Expo 工具链用） | `node --version` |
| JDK | 17（只有打安卓包需要） | `java -version` |
| Android SDK | platform 36 + build-tools（打安卓包需要） | `echo $env:ANDROID_HOME` |

不需要：Docker、Xcode（除非做 iOS）、任何数据库服务（SQLite 是文件）。

---

## 1. 五分钟跑起来

```bash
cd E:\gtd清单
bun install          # 只需一次；首次会下载较大依赖
bun run dev:web      # 起 web 预览（最快看到界面）
```

浏览器打开终端里给出的地址（通常 `http://localhost:8081`）。
数据存在浏览器 IndexedDB/内存里，随便点不会影响桌面端的库。

> **为什么先跑 web**：不需要模拟器、不需要 Electron 窗口，热重载最快，适合改 UI。

---

## 2. 三种运行形态

```bash
# ① Web（日常改 UI / 改逻辑，最快）
bun run dev:web

# ② 桌面（Electron；验证托盘、菜单、快捷键、原生对话框）
bun run build:desktop     # 先导出 web 产物 + 打包主进程
bun run dev:desktop       # 起 Electron

# ③ 安卓真机 / 模拟器（验证原生能力：通知、安全存储、SAF 导出）
cd apps/mobile
bunx expo prebuild -p android --no-install
bun run android
```

桌面冒烟（无窗口，只验证主进程与命令层）：

```bash
bun run smoke:desktop
bun run verify:sqlite
```

---

## 3. 五个目录，够你找到东西

```
packages/core/src/
  models/      实体类型与命令 payload（改字段先看这里）
  db/          命令 handler、查询、迁移、coerce（改数据先看这里）
  features/    纯算法：快速添加、理清、统计、搜索、导入导出、重复……（改行为先看这里）
  sync/        同步编排、合并、Provider、加密原语
  store/       全局 store + selectors（派生逻辑都在这）

packages/ui/src/
  theme/       tokens（唯一设计真源）、原语、AppText
  components/  39 个业务组件
  i18n/        中英文字典（zh/en 必须同时加）

apps/mobile/src/
  app/         24 个路由文件（Expo Router，文件名即路径）
  platform/    平台适配：bootstrap / ipc 桥 / 导出 / 安全存储 / 同步调度
  hooks/       页面级复用的交互 hook
  lib/         小工具（task-ops、context-menu…）

apps/desktop/src/main/
  9 个文件：main / window / menu / ipc / backup / updater / smoke / state / db
```

改代码前先记住一句：**core 里不许出现 `window` / `fetch` 之外的平台 API，也不许出现 React。**

---

## 4. 核心心法：一条命令的一生

这是整个项目最重要的机制。以「你点了一下任务前的勾选框」为例，跟完这条链你就懂 80% 的代码了。

```
① 点勾选框
   packages/ui/src/components/TaskRow.tsx        onToggle()

② 页面传的处理函数
   apps/mobile/src/app/(tabs)/index.tsx          onToggleTask={... completeTaskWithUndo(task)}

③ 动作封装（含撤销）
   apps/mobile/src/lib/task-ops.ts:19            completeTaskWithUndo()
     ├─ runCommand("task.complete", { id })
     └─ showUndo(..., () => runCommand("task.uncomplete", { id }))

④ 统一出口
   packages/core/src/store/app-store.ts:133      runCommand()
     └─ getCommandPort().dispatch(op, payload)

⑤ 端口路由（同一份代码，两种落地）
   移动端  apps/mobile/src/platform/bootstrap.ts:66
           dispatch → executeCommand(executor, op, payload, ctx)
   桌面    apps/mobile/src/platform/bootstrap.ts:232
           dispatch → api.command()  → IPC → apps/desktop/src/main/ipc.ts:95
                     （先过 COMMAND_OPS 白名单，再 executeCommand）

⑥ 命令入口：校验 + 事务
   packages/core/src/db/commands/index.ts        executeCommand()
     ├─ COMMAND_REGISTRY[op].schema.parse(payload)   // zod，非法 → AppError("validation_failed")
     └─ executor.transaction("immediate", handler)

⑦ 真正的业务
   packages/core/src/db/commands/task.ts         "task.complete" handler
     ├─ 读现有任务
     ├─ 若为重复任务：算下一次 → 推进 dueAt、记 lastCompletedAt
     └─ 否则：status="done"、completedAt=now、revision+1
        UPDATE tasks SET ... WHERE id = ?          // 静态 SQL + 参数绑定

⑧ 回传 + 落进 store
   CommandResult { ids, records, serverTime }
     └─ packages/core/src/store/app-store.ts:53  applyRecords()
          ├─ deletedAt !== null → 从 store 删除
          └─ 否则 → 覆盖写入
               → zustand 通知 → 用到这条任务的组件重渲染
```

**为什么这么设计**（一句话版）：

- 只有一条写入路径 → 撤销、同步、审计、乐观更新都只需在一处挂；
- 命令自带 zod schema → 坏数据进不了库，IPC 也无法越权调任意 SQL；
- handler 是纯"事务内函数" → 可以直接在 `bun test` 里用真 SQLite 跑，不用起 UI。

**你自己验证一遍**：把 ③ 的 `task.complete` 改成 `task.uncomplete`，勾选就变成取消完成——一处改动，全链路生效。

---

## 5. 实战：改四个功能（由易到难）

### 例 1：改文案（2 分钟）

`packages/ui/src/i18n/index.ts` 里找 key（中英两段都要改），保存即热重载。

> 规矩：**不许在组件里写字面量文案**，一律 `t("...")`。

### 例 2：改一个纯算法（10 分钟）

「四象限里"紧急"是多少小时？」→ `packages/core/src/features/matrix.ts` 的 `URGENT_WINDOW_MS`（现在 48 小时）。

改完先跑它的测试：

```bash
bun test packages/core/src/__tests__/v2-stats-matrix.test.ts
```

### 例 3：加一个任务字段（30 分钟，走完整链路）

假设要加 `energy`（精力消耗：低/中/高）。按顺序改 5 处，每处都会在编译期提醒你漏了哪：

1. `packages/core/src/models/task.ts` — `Task` 接口加 `energy`
2. `packages/core/src/db/migrations.ts` — **追加** v7 迁移：`ALTER TABLE tasks ADD COLUMN energy TEXT`
3. `packages/core/src/db/mappers.ts` — `taskFromRow` / `taskToParams` 加上读写
4. `packages/core/src/models/commands.ts` — `TaskCreatePayload` / `TaskUpdatePayload` 加可选 `energy`
5. `packages/core/src/db/coerce.ts` — 白名单加 `energy`（否则**同步接收与 JSON 导入会静默丢弃这个字段**，且不报错）

> 第 5 步是最容易漏、也最隐蔽的一步。真实案例：`coerceTask` 曾只接受 6 种重复频率中的 4 种，
> 导致"每工作日""完成后 3 天"两类重复任务经过同步后 `recurrence` 变成 `null`——
> 规则静默消失，没有任何报错。加字段时**一定要回来看这个文件**。
> 现在有 `__tests__/v3-coerce-recurrence.test.ts` 兜这条线。

然后 UI：`packages/ui/src/components/TaskDetailContent.tsx` 加一行选择器 → 页面传 `runCommand("task.update", { id, patch: { energy } })`。

最后跑：

```bash
cd packages/core && bunx tsc --noEmit
cd ../../apps/mobile && bunx tsc --noEmit
bun test packages/core
```

### 例 4：加一个命令（15 分钟）

比如「批量置顶」。**4 个文件 5 处改动，缺一不可**：

```ts
// ① packages/core/src/models/commands.ts —— 两处
export const taskPinPayloadSchema = z.object({ id: idSchema });
export type TaskPinPayload = z.infer<typeof taskPinPayloadSchema>;

export interface CommandMap {
  // …
  "task.pin": TaskPinPayload;          // ← 加这一行
}

// ② packages/core/src/db/commands/task.ts —— 两处
const pinTask: Handler<"task.pin"> = async (tx, payload, ctx) => {
  // 读写都用静态 SQL + 参数绑定；返回被改写的记录
};

export const taskCommands = {
  // …
  "task.pin": pinTask,                  // ← 加这一行
};

// ③ packages/core/src/db/commands/index.ts —— 一处
export const COMMAND_REGISTRY = {
  // …
  "task.pin": { schema: taskPinPayloadSchema, handler: taskCommands["task.pin"] },
};

// ④ apps/desktop/src/main/ipc.ts —— 一处
const COMMAND_OP_FLAG: { [K in CommandOp]: true } = {
  // …
  "task.pin": true,                     // ← 忘了这里，桌面端会报「未注册的命令」
};
```

Handler 签名固定为 `(tx: SqliteExecutor, payload, ctx: CommandContext) => Promise<HandlerResult>`（定义在 `db/commands/shared.ts`）。
`HandlerResult` 可以是 `TaggedRecord[]`，也可以是 `{ records, mergeSummary }`（只有 sync/import 用富形状）。

③② 的顺序反了也没关系——`CommandMap` 加了类型，漏注册会在 `COMMAND_REGISTRY` 的 `{[K in CommandOp]: …}` 类型上直接报错，这是设计上的"漏改检查"。

---

## 6. 验收：三条命令

改完任何东西，至少跑这三条：

```bash
# ① 四个包的类型检查（类型错不会被测试发现）
cd packages/core && bunx tsc --noEmit
cd ../../packages/ui && bunx tsc --noEmit
cd ../../apps/mobile && bunx tsc --noEmit
cd ../../apps/desktop && bunx tsc --noEmit

# ② 全量测试（注意：根 package.json 的 `bun run test` 只跑 core）
cd ../../ && bun test packages/core packages/ui apps/desktop/tests

# ③ 产物能构建出来（能抓出只在打包时暴露的问题）
bun run export:web
```

想更省事，可以把 ① 写成一个脚本；CI 里也是这四条。

---

## 7. 常见坑（都是真实踩过的）

| 现象 | 原因 | 解法 |
|---|---|---|
| `bun install` 报 `EPERM` | 全局缓存目录不可写 | 指定可写缓存：`$env:BUN_INSTALL_CACHE_DIR="C:\temp\bun"` 后再装 |
| Expo / Metro 解析依赖失败 | `bunfig.toml` 的 `linker="hoisted"` 没生效 | 确认该文件存在且 `bun.lock` 是 hoisted 布局；必要时删 `node_modules` 重装 |
| Electron 启动报 `platform_channel.cc ... Check failed` | 运行环境禁止 Mojo 命名管道（常见于受限沙箱） | 换正常桌面会话；或用 `bun run smoke:desktop` 做无窗口验证 |
| 本地 `assembleRelease` 卡在 CMake / ninja | 原生 C++ 构建被环境限制 | 走 CI（`.github/workflows/apk.yml`）出包 |
| PowerShell 里 `node -e "…中文…"` 参数被吃掉 | PowerShell 的引号转义规则 | 把脚本写成 `.mjs` 文件再 `node file.mjs` |
| 桌面端提示「未注册的命令」 | 忘了加 `ipc.ts` 白名单 | 见 §5 例 4 第 ④ 步 |
| 界面文案没变 | 只改了中文没改英文，或反之 | `i18n/index.ts` 两段都要改；`a11y-audit.test.ts` 会查一致性 |
| 列表卡顿 | selector 返回了新对象（React #185） | selector 只返回原始值，或用 `useShallow` |
| 同步在手机上崩 | 用了 Hermes 没有的全局（`btoa` / `TextEncoder` / `crypto.subtle`） | 用 `sync/crypto.ts` 里的纯 JS 实现 |
| 大字体把界面撑坏 | 直接用 RN `<Text>` 而没走 `AppText` | 文字一律用 `AppText`（它锁了 `allowFontScaling`） |

---

## 8. 调试技巧

**看真实 SQL**：把所有命令都走 `executeCommand`，临时在 `db/commands/index.ts` 的事务前后打日志即可；也可以在测试里直接拿到 executor 断言表内容（`bun test` 用的是真 SQLite，不是 mock）。

**造一条测试数据**（不启 UI）：

```ts
// scratch.mjs —— 用 bun 直接跑
import { openDatabase, runMigrations, executeCommand } from "./packages/core/src/index.ts";
```

更省事的办法：在 `packages/core/src/__tests__/` 里临时写一个 `.test.ts`，用 `bun test 文件名` 跑——现成的内存库、迁移、命令入口都齐了（看 `v2-templates.test.ts` 的开头几行照抄）。

**看 store 变化**：

```ts
import { appStore } from "@gtd/core";
appStore.subscribe((s, prev) => console.log("tasks changed", Object.keys(s.tasks).length));
```

**桌面端 DevTools**：`Ctrl+Shift+I`（或菜单 → 视图 → 切换开发者工具）。

**查 IPC 契约**：`apps/desktop/src/preload/preload.ts` 是通道名与参数顺序的唯一真源，改主进程时对照它。

---

## 9. 提交前自查

- [ ] 四个包 `tsc --noEmit` 全绿
- [ ] `bun test packages/core packages/ui apps/desktop/tests` 全绿
- [ ] `bun run export:web` 成功
- [ ] 新增文案中英都有
- [ ] 文字用 `AppText`、颜色用 `useTheme()` / `space`，没有写死 hex
- [ ] 破坏性操作有撤销或二次确认
- [ ] 改了命令 → 桌面白名单同步了
- [ ] 改了 schema → 迁移是**追加**的（没改历史版本）
- [ ] 文档里提到的数字/命令清单是否需要同步（`doc-conformance.test.ts` 会拦）

---

## 10. 想深入了解时读什么

| 想搞清楚 | 读 |
|---|---|
| 每个功能怎么实现的 | `features-implementation.md` |
| 数据模型、命令规范、算法细则、发布流程 | `technical-reference.md` |
| 同步（合并规则、自动同步、凭据） | `sync-overview.md` |
| 导入导出六种格式的字段与陷阱 | `import-export-formats.md` |
| 为什么某些功能没做 / 该删什么 | `ux-feature-audit.md` |
| 用户视角怎么用 | `user-feature-guide.md` |

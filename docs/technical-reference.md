# GTD 清单 · 技术文档（v2.0）

> 版本：v2.0（深度重构版） · 文档状态：与 `E:\gtd清单` v2 代码同步
> 读者：接手开发者、贡献者、评审者、未来的 AI agent
> 适用仓库结构：Bun workspaces monorepo（`packages/core` / `packages/ui` / `apps/mobile` / `apps/desktop`）

本文是**单一可信来源**：产品定位、功能规格、架构、领域模型、命令 API、核心算法、UI 设计系统、平台适配、同步、安全、测试、构建发布、迁移与路线图，全部在此。

配套文档（历史/专题）：
- [`architecture.md`](./architecture.md)：v1 架构草图（历史参考）
- [`ui-design-system.md`](./ui-design-system.md)：v1 设计系统纪要（历史参考，已被本文 §10 取代）
- [`sync-providers.md`](./sync-providers.md)：同步服务端接入指南
- [`security-audit-2026-10-25.md`](./security-audit-2026-10-25.md)：安全审计记录

---

## 目录

1. [产品概览](#1-产品概览)
2. [设计原则](#2-设计原则)
3. [技术栈](#3-技术栈)
4. [系统架构](#4-系统架构)
5. [领域模型](#5-领域模型)
6. [数据层](#6-数据层)
7. [命令 API](#7-命令-api)
8. [核心算法](#8-核心算法)
9. [状态管理](#9-状态管理)
10. [UI 设计系统 v2](#10-ui-设计系统-v2)
11. [交互规范](#11-交互规范)
12. [平台适配层](#12-平台适配层)
13. [同步与备份](#13-同步与备份)
14. [安全模型](#14-安全模型)
15. [测试策略](#15-测试策略)
16. [构建与发布](#16-构建与发布)
17. [性能预算与观测](#17-性能预算与观测)
18. [目录结构与模块边界](#18-目录结构与模块边界)
19. [v1 → v2 迁移指南](#19-v1--v2-迁移指南)
20. [路线图与已知限制](#20-路线图与已知限制)
21. [附录](#21-附录)

---

## 1. 产品概览

**GTD 清单**是一个**本地优先（local-first）的 GTD 任务管理应用**：一套代码，四端运行（Windows / macOS / Linux / Android，iOS 为同源构建）。

### 1.1 一句话定位

> 打开就能记，关掉不丢数据；不注册账号也能用；同步是可选增强，不是前置条件。

### 1.2 目标用户与场景

| 用户 | 场景 | 关键诉求 |
|---|---|---|
| 知识工作者 | 每天 20–50 条待办，跨项目 | 快速捕获、清晰的下一次行动、可靠的每周回顾 |
| 自由职业者 | 多客户并行 | 项目/区域分组、情境筛选、专注模式 |
| 隐私敏感者 | 不愿把任务清单交给 SaaS | 本地 SQLite、自托管同步、无遥测 |
| 双设备用户 | 手机记、电脑做 | 确定性合并、冲突可见、离线可用 |

### 1.3 能力矩阵（v2）

| 维度 | 能力 |
|---|---|
| **捕获** | 28+ 种自然语言语法（中英）、全局快捷键、托盘、`gtd://` 深链、命令面板 |
| **理清** | 收件箱逐条处理向导（GTD 决策树）、四状态流转、开始日期（defer） |
| **组织** | 项目（顺序/并行）、分区、区域、情境、标签、清单子项、附件、星标 |
| **回顾** | 六步每周回顾、项目回顾周期、统计面板、完成趋势 |
| **执行** | 今天、即将、日历、Timeline、看板、专注（番茄钟）、四象限矩阵 |
| **检索** | 全局搜索（任务/项目/笔记/标签，带排序与高亮）、保存的筛选、命令面板 |
| **安全网** | 撤销、回收站、本地自动备份、云备份 |
| **同步** | WebDAV / S3 / 自托管 / 本地文件夹，revision 合并 + 墓碑 |
| **导出** | JSON 全量、Markdown 清单、ICS 日历 |
| **导入** | Markdown 复选框清单、Todoist CSV（粘贴即导入，自动建项目/情境/标签） |
| **平台** | 桌面托盘/全局快捷键/原生菜单/右键菜单；移动分享/深链/字体缩放防御 |

### 1.4 不做什么（Non-goals）

- 不做多人协作/共享清单（同步是单用户多设备，不是协作）；
- 不做账号体系与云端托管（没有官方服务器）；
- 不做 AI 自动排期（自然语言解析是确定性的规则引擎）；
- 不做遥测与埋点（零网络请求，除用户主动配置的同步）。

### 1.5 版本与兼容

| 项 | 值 |
|---|---|
| 应用版本 | `2.0.0`（`apps/mobile/app.json` 的 `expo.version` 与 `expo.android.versionCode` 双层维护） |
| 数据库 schema | v4（v1→v3 由 `migrate()` 顺序执行，v4 见 §6.2） |
| 最低系统 | Android 7.0（minSdk 24）/ iOS 15.1 / Windows 10 / macOS 11 |
| 数据格式 | 记录 = JSON 可克隆对象；备份 = `gtd-backup-<ts>.json`；同步 = manifest + 按记录分片 |

---

## 2. 设计原则

这七条是**评审时的否决线**，不是口号。

### 2.1 本地优先

数据的主副本永远在设备上的 SQLite。任何网络能力（同步、云备份、更新检查）都必须：可关闭、失败可降级、不阻塞启动、不阻塞命令。

### 2.2 命令是唯一写入口

UI 不写 SQL、不改状态。所有写操作走 `{ op, payload }`：

```
UI → runCommand(op, payload) → 端口分发（本地执行 / IPC）→ zod 校验
   → immediate 事务 → handler → CommandResult{ids, records, serverTime}
   → applyRecords 合并进 store → React 订阅重渲染
```

收益：可审计、可测试、可序列化（IPC 天然安全边界）、撤销与批量操作可组合。

### 2.3 业务逻辑只写一次

GTD 的决策（什么算今天、重复怎么推进、合并谁赢）全部在 `packages/core`，且**不依赖 React/RN**。壳层（Expo / Electron）只做平台能力适配。

### 2.4 平台差异收敛到极少数文件

允许出现 `.web.ts` / `.native.ts` 的地方仅限：日期选择、右键菜单、Modal、附件选择、键盘快捷键、字体缩放、剪贴板/分享。新增平台分支必须先问：能否用统一抽象解决？

### 2.5 结构解决，而非补丁

典型例子：Android 大字体错乱不是靠逐组件调样式修好的，而是把**所有文本收敛到唯一原语 `AppText`**，字号行高在 token 层锁死。同类问题优先找结构性解法。

### 2.6 可访问性是默认值

对比度 ≥4.5:1、触控 ≥44px、图标按钮必有 label、键盘可达、焦点可见——由测试守护，不靠自觉。

### 2.7 保守的安全姿态

SQL 零拼接、IPC 白名单、路径白名单、密钥不进代码、CI action 按 SHA 固定、发布资产逐项校验。宁可多一步验证，不做"应该没问题"的假设。

---

## 3. 技术栈

| 层 | 选型 | 版本约束 | 选它的理由 |
|---|---|---|---|
| 运行时/包管理 | Bun workspaces（`linker = "hoisted"`） | Bun ≥1.4.4 | 安装快、workspace 简单、与 Expo/Metro 兼容（hoisted 必须） |
| 语言 | TypeScript（strict） | 5.9.x | 跨包类型即契约 |
| 业务核心 | 纯 TS + zod + zustand/vanilla | zod 4 / zustand 5 | 无 React 依赖，可在主进程/测试中直接跑 |
| UI | React Native primitives + react-native-web | RN 0.86 / RNW 0.21 | 一套组件四端渲染 |
| 图标 | @expo/vector-icons（Ionicons） | 随 Expo | 统一图标语言，不用 emoji 当图标 |
| 移动壳 | Expo SDK 57 + Expo Router | expo ~57.0.31 | 文件路由 + 原生能力 + web 导出 |
| 桌面壳 | Electron | 43.8.x | 成熟托盘/菜单/通知/协议能力 |
| 桌面存储 | better-sqlite3（N-API） | ≥13 | 同步 API、事务可控、主进程独占 |
| 移动存储 | expo-sqlite | ~57 | 渲染进程内执行同一命令表 |
| 桌面打包 | electron-builder | 26.x | NSIS/AppImage/dmg 一套配置 |
| 测试 | bun:test | 内置 | 零配置、快 |
| CI | GitHub Actions | action 按 SHA 固定 | 零制品存储，直发 Release |

**禁止事项**：核心包引入 React；UI 包直接访问 SQLite；渲染进程直接 `require("electron")`；新增依赖不评估体积与许可证。

---

## 4. 系统架构

### 4.1 分层与依赖方向

```
┌──────────────────────────────────────────────────────────────┐
│ apps/desktop (Electron 壳)          apps/mobile (Expo 壳)     │
│  main: 窗口/托盘/菜单/IPC/备份        app/: 路由/页面/壳适配    │
│  preload: 类型化 window.gtd          platform/: 端口注入        │
└───────────────┬──────────────────────────────┬───────────────┘
                │ 只依赖 core（主进程）          │ 只依赖 ui + core
                ▼                              ▼
        ┌──────────────────────────────────────────────┐
        │ packages/ui                                   │
        │  设计系统 tokens / 原语 / 组件 / i18n / hooks   │
        └───────────────────────┬──────────────────────┘
                                ▼
        ┌──────────────────────────────────────────────┐
        │ packages/core                                 │
        │  models / db(commands,queries,migrations)     │
        │  features / sync / store / platform ports     │
        └──────────────────────────────────────────────┘
```

依赖规则：
- `desktop(main)` 只 import `@gtd/core`，**不 import `@gtd/ui`**；
- `desktop(renderer)` 就是 mobile 的 web 导出产物，因此天然复用 `ui`；
- `mobile` 可以 import `ui` 与 `core`；`ui` 只 import `core`；
- `core` 不 import 任何上层，不 import `react`/`react-native`/`electron`。

### 4.2 四端运行矩阵

| 端 | 渲染层 | 数据层 | 备注 |
|---|---|---|---|
| Windows / macOS / Linux | Expo web 导出（`app://gtd/` 自定义协议） | 主进程 better-sqlite3，经 IPC | 全功能 + 原生增强 |
| Android | RN 原生渲染 | 渲染进程 expo-sqlite | 全功能，签名 APK |
| iOS | RN 原生渲染 | 渲染进程 expo-sqlite | 同源构建，未真机验证 |
| Web（开发用） | react-native-web | expo-sqlite web（或内存） | 仅开发/截图 |

### 4.3 数据流（命令架构）

```
① 用户操作（点击/滑动/快捷键/命令面板/深链）
② runCommand(op, payload)                  ← 唯一写入口
③ CommandPort.dispatch
     ├─ 移动：本地 executor 直接执行
     └─ 桌面：ipcRenderer.invoke("command") → 主进程
④ 主进程：白名单校验 op + payload 为对象 → enqueueDb 串行队列
⑤ core.executeCommand：zod 校验 → BEGIN IMMEDIATE → handler → COMMIT
⑥ 返回 CommandResult{ ids, records[], serverTime }
⑦ applyRecords(records) 合并进 zustand store（墓碑记录从状态里移除）
⑧ React 组件经 useAppStore(useShallow(selector)) 重渲染
```

失败路径：zod 校验失败 → `AppError(validation_failed)`；handler 抛错 → 事务回滚 → `AppError`；渲染层捕获后写 `store.lastError` 并 toast。

### 4.4 桌面进程模型

```
main 进程
├─ SQLite（WAL, busy_timeout=5000, 串行队列 enqueueDb）
├─ 命令分发 + 查询（SELECT-only 校验）
├─ 窗口 / 托盘 / 应用菜单 / 全局快捷键 / 通知
├─ dialog / fs（allowedRoots 白名单）
├─ 备份（VACUUM INTO，保留 7 份）
├─ safeStorage（DPAPI/Keychain/libsecret）
└─ 自动更新检查

preload
└─ contextBridge 暴露 window.gtd（类型化，事件走白名单）

renderer（Expo web 导出）
└─ app://gtd/ 加载：静态命中 → SPA fallback → index.html
```

### 4.5 移动进程模型

单进程：Expo Router 挂载页面 → `initPlatform()` 注入端口（SQLite executor / Notifications / Files / Share / DeepLink）→ `bootstrapStore()` 载入全量数据 → 命令在渲染进程内执行（同一份 core 代码）。

### 4.6 关键设计取舍

| 取舍 | 选择 | 代价 | 为什么不选另一条 |
|---|---|---|---|
| 桌面渲染层复用 web 产物 | 是 | 无法用 Electron 原生控件 | 一套 UI 四端，维护成本减半；原生能力用 IPC 补 |
| 全量 bootstrap 载入内存 | 是（万级任务） | 内存随任务数增长 | 本地 GTD 规模有限，换来零延迟筛选/搜索 |
| 命令返回完整记录快照 | 是 | 传输量略大 | 渲染层无需猜测字段，合并确定性高 |
| 同步用 revision 计数器 | 是 | 需要每次写自增 | 不依赖时钟，冲突可解释 |
| 单 store（zustand） | 是 | store 较大 | 交叉视图派生多，分片反而复杂 |

---

## 5. 领域模型

### 5.1 实体关系

```
Area 1 ──── n Project 1 ──── n Section
                 │                  │
                 └──────┬───────────┘
                        ▼
Task n ──── n Context        Task 1 ──── n Attachment
  │
  └── checklist[]（内嵌，不独立成表）
```

- 区域（Area）是项目的上层归类；项目可无区域（`areaId = null`）。
- 任务可属于项目（可选）与项目内分区（可选）；分区必须属于同一项目。
- 情境（Context）是多对多：任务用 `contextIds[]` 引用；按名 find-or-create。
- 附件只存元数据，二进制在文件系统。
- 清单子项（checklist）内嵌在任务记录里，随任务一起同步。

### 5.2 BaseRecord（所有记录的底座）

```ts
interface BaseRecord {
  id: string;          // uuidv7，时间有序
  createdAt: number;   // 毫秒时间戳
  updatedAt: number;   // 毫秒时间戳，每次写更新
  revision: number;    // 单调递增本地计数器，同步合并的第一决胜键
  deletedAt: number | null; // 软删除墓碑
}
```

不变量：
1. `revision` 只能单调递增，任何写操作 `+1`（包括 restore / 墓碑）。
2. `deletedAt !== null` 的记录不进入任何业务视图，只参与同步与回收站。
3. `updatedAt` 只用于合并的次级决胜与展示，**不参与业务排序**（时钟可被用户改动）。

### 5.3 Task

| 字段 | 类型 | 默认 | 语义 | 备注 |
|---|---|---|---|---|
| `title` | string | — | 任务标题 | 1..2000 字符，快速添加的"残余文本" |
| `notes` | string | `""` | Markdown 笔记 | ≤100k，支持 checklist/链接/代码块 |
| `status` | enum | `inbox` | `inbox / next / waiting / someday / done` | 见 §5.5 状态机 |
| `priority` | 0..3 | `0` | 0 无 / 1 低 / 2 中 / 3 高 | 影响矩阵"重要性" |
| `deferUntil` | number \| null | null | 开始日期（defer） | 未到时间不在可执行视图出现 |
| `dueAt` | number \| null | null | 到期时间 | 今天/即将/日历/通知的依据 |
| `completedAt` | number \| null | null | 完成时间（普通任务） | `status=done` 时写入 |
| `lastCompletedAt` | number \| null | null | 最近一次完成时间（重复任务） | 完成即推进 dueAt，保留痕迹 |
| `projectId` | string \| null | null | 所属项目 | 删除项目时任务保留并解绑 |
| `sectionId` | string \| null | null | 项目内分区 | 必须与 projectId 同项目 |
| `contextIds` | string[] | `[]` | 情境 | 多对多，find-or-create |
| `tags` | string[] | `[]` | 标签 | normalizeTag 后存储，大小写不敏感去重 |
| `waitingFor` | string \| null | null | 等待谁 | `status=waiting` 时建议填写 |
| `starred` | boolean | false | 选入专注 | 专注视图优先级最高 |
| `recurrence` | RecurrenceRule \| null | null | 重复规则 | 见 §8.2 |
| `checklist` | ChecklistItem[] | `[]` | 子项 | 内嵌，`{id,title,done,orderKey}` |
| `orderKey` | string | `padOrderKey(now)` | 列表排序键 | 15 位零填充十进制字符串，字典序即展示序 |

### 5.4 其他实体

**Project**

| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `name` | string | — | 项目名（≤500） |
| `description` | string | `""` | 项目说明（≤20k） |
| `kind` | `sequential` \| `parallel` | `parallel` | 顺序项目只暴露"下一个行动" |
| `status` | `active` \| `onHold` \| `done` | `active` | 非 active 不进入活跃列表 |
| `color` | string \| null | null | 项目色（十六进制） |
| `areaId` | string \| null | null | 所属区域 |
| `reviewIntervalDays` | number | 7 | 回顾周期（1..365） |
| `lastReviewedAt` | number \| null | null | 上次回顾时间 |

**Section**：`projectId`、`name`、`orderKey`。项目详情按 `orderKey` 分组渲染。

**Context**：`name`（不含 `@` 前缀）、`color`、`icon`。唯一索引 `(name) WHERE deleted_at IS NULL`，保证 find-or-create 幂等。

**Area**：`name`、`color`、`orderKey`。删除区域时项目回落"未分组"（不级联删除）。

**Attachment**：`taskId`、`fileName`、`mimeType`、`size`、`storagePath`。二进制不入库。

**TaskTemplate**：`name`（模板名）、`title`/`notes`/`priority`/`projectId`/`contextIds`/`tags`/`checklist`/`recurrence`——只存任务骨架，不存日期与完成状态。`template.instantiate` 在单事务内据此创建任务（checklist 子项重新生成 id）。

**KV**（键值设置，不同步）：`lang`、`theme.mode`、`font.family`、`sync.config`、`sync.log`、`sync.last`、`review.lastAt`、`filters.saved`、`seeded`、`tombstone.lastCompactAt`、`timed.<id>:<dueAt>` 等。

### 5.5 任务状态机

```
                 ┌──────────── 捕获 ────────────┐
                 ▼                              │
            ┌─────────┐  理清（可行动）  ┌────────┐
            │  inbox  │ ───────────────► │  next  │
            └─────────┘                  └────────┘
              │   │                          │
   等待他人   │   │  暂不处理                 │ 完成
              ▼   ▼                          ▼
        ┌──────────┐ ┌──────────┐      ┌────────┐
        │ waiting  │ │ someday  │      │  done  │
        └──────────┘ └──────────┘      └────────┘
              │           │                 │
              └───────────┴── 重新激活 ◄────┘（uncomplete）
```

规则：
- `done` 是唯一终态；`task.uncomplete` 把状态恢复为 `projectId ? next : inbox`，清空 `completedAt`（不改 `lastCompletedAt`）。
- 重复任务完成**不进入 done**：推进 `dueAt` 到下一次，写 `lastCompletedAt`，`completedAt` 保持 null；剩余次数归零或超过 `until` 才真正 done。
- `deferUntil` 与状态正交：任何非 done 状态都可被推迟，`isDeferred(task, now)` 为真时从可执行视图隐藏。

---

## 6. 数据层

### 6.1 表结构

| 表 | 主键 | 关键列 | 索引 |
|---|---|---|---|
| `meta` | `key` | `value` | — |
| `tasks` | `id` | 全部任务字段（snake_case） | `(status, deleted_at)`、`(project_id)`、`(due_at)` |
| `projects` | `id` | 项目字段 | `(status, deleted_at)` |
| `sections` | `id` | `project_id`、`name`、`order_key` | `(project_id)` |
| `contexts` | `id` | `name`、`color`、`icon` | 唯一 `(name) WHERE deleted_at IS NULL` |
| `areas` | `id` | `name`、`color`、`order_key` | `(name)` |
| `attachments` | `id` | `task_id`、`storage_path` | `(task_id)` |
| `task_templates` | `id` | 任务骨架字段（title/notes/priority/project_id/context_ids/tags/checklist/recurrence） | `(deleted_at)` |
| `kv` | `key` | `value`（TEXT） | — |
| `sync_cursors` | `device_id` | `acked_revision`、`last_pull_at` | — |

存储类型约定：
- 时间戳一律 INTEGER（毫秒）；
- 布尔用 INTEGER 0/1；
- 数组/对象用 TEXT 存 JSON（`context_ids`、`tags`、`checklist`、`recurrence`）；
- 列名 snake_case，TS 字段 camelCase，转换集中在 `db/mappers.ts`。

### 6.2 迁移策略

- 版本号存 `meta.schema_version`，`migrate()` 按 `version` 升序逐条执行，每条一个事务（`deferred`，启动期独占）。
- 迁移语句必须是静态字面量数组，不允许拼接；版本号写入用参数绑定。
- 已发布迁移**永不修改**，只追加新版本。

| 版本 | 内容 |
|---|---|
| v1 | tasks / projects / sections / contexts / attachments / kv / sync_cursors + 基础索引 |
| v2 | `tasks.defer_until`；`projects.review_interval_days`、`last_reviewed_at` |
| v3 | `tasks.tags`；`areas` 表；`projects.area_id` |
| v5 | `task_templates` 表 + `idx_task_templates_active`（任务模板；只存骨架） |
| v4 | 排序与同步扫描索引加固：`idx_tasks_order(status, order_key)`、`idx_tasks_updated(updated_at)`、`idx_projects_area(area_id)`、`idx_tasks_deleted(deleted_at)`；回填历史空 `order_key`（`printf('%015d', rowid)`） |

v4 的取舍：不回填历史数据的业务字段、不改语义，只解决"全表扫描 + 空排序键导致顺序不稳定"两个真实问题，迁移可在毫秒级完成。

### 6.3 行映射与强转

- `db/mappers.ts`：双向映射（`taskFromRow` / `taskToParams`），参数数组**按字段名显式构造**，禁止依赖索引偏移（历史上因加列错位踩过坑）。
- `db/coerce.ts`：导入/同步的不可信数据先经 `coerceTaggedRecords` 逐字段强转（缺字段补默认、类型不符丢弃该字段、数组元素过滤非法值），再进入合并。
- 强转失败不抛整批错误：坏记录被跳过并计入同步日志，避免一条脏数据阻断整次同步。

### 6.4 SQL 纪律

1. 单条 SQL = 单一静态字符串字面量 + `?` 参数绑定；
2. 动态列/排序必须走白名单映射（当前命令层无动态列）；
3. 事务模式：写操作一律 `immediate`，读操作不用事务；
4. 桌面端 `query` IPC 额外校验：仅 `SELECT/WITH`、禁多语句、禁 ATTACH、禁写 PRAGMA。

### 6.5 连接与并发

| 端 | 驱动 | 配置 |
|---|---|---|
| 桌面 | better-sqlite3 | `journal_mode=WAL`、`busy_timeout=5000`、`foreign_keys=ON`，仅主进程持有 |
| 移动 | expo-sqlite | WAL（平台支持时）、单连接 |

桌面主进程所有 DB 操作经 `enqueueDb()` 串行化，保证"同一时刻只有一个事务"；渲染进程的并发请求排队执行，不产生 `SQLITE_BUSY`。

### 6.6 墓碑与压缩

- 删除 = 置 `deletedAt`，记录保留参与同步；
- `compactTombstones` 物理删除超过 **90 天**的墓碑，每日至多一次（`kv["tombstone.lastCompactAt"]` 门控）；
- 语义代价（已文档化）：离线超过 90 天的设备看不到这些删除，旧记录会"复活"参与合并。这是可接受的取舍——更长的保留期会让库无限膨胀。

---

## 7. 命令 API

### 7.1 契约

```ts
interface Command<K extends CommandOp> { op: K; payload: CommandMap[K] }

interface CommandResult {
  ids: string[];              // 受影响实体 id
  records: TaggedRecord[];    // 变更后完整快照，可结构化克隆
  serverTime: number;         // 执行时刻（渲染层据此对齐时钟）
}

type TaggedRecord =
  | { type: "task" | "project" | "section" | "context" | "area" | "attachment"; record: ... }
```

三条硬约束：

1. **payload 必须可结构化克隆**：禁止函数、类实例、循环引用、`undefined` 之外的稀疏数组；由 `ipc-serializable.test.ts` 对全部 op 做 `structuredClone` 往返断言。
2. **schema 是唯一契约来源**：`models/commands.ts` 定义每个 op 的 zod schema，`db/commands/index.ts` 的注册表类型强制"每个 op 必须有 schema 与 handler"。
3. **事务边界 = 命令边界**：一个命令一个 `immediate` 事务；命令之间不共享事务（`sync.applyRemote` 按批切开，见 §13）。

### 7.2 命令清单

| op | payload | 语义 | 返回记录 |
|---|---|---|---|
| `task.create` | `{title, notes?, status?, priority?, deferUntil?, dueAt?, projectId?, sectionId?, contextIds?, tags?, waitingFor?, starred?, recurrence?, checklist?}` | 新建任务，`orderKey = pad15(now)` | task |
| `task.update` | `{id, patch:{…同上可编辑字段}}` | 字段级 patch；`undefined` 表示不改，`null` 表示清空（`deferUntil/dueAt/projectId/sectionId/waitingFor/recurrence`） | task |
| `task.moveStatus` | `{id, status: inbox\|next\|waiting\|someday}` | 只改状态（看板拖拽/理清流） | task |
| `task.reorder` | `{idsInOrder: string[]}` | 整组重写 `orderKey`（`pad15(index)`），忽略不存在的 id | 全部被改 task |
| `task.complete` | `{id}` | 完成；重复任务推进而非完成（见 §8.2） | task |
| `task.uncomplete` | `{id}` | 撤销完成，状态恢复 `projectId ? next : inbox`，清 `completedAt` | task |
| `task.softDelete` | `{id}` | 置墓碑 | task（deletedAt 非空） |
| `task.restore` | `{id}` | 清墓碑并 `revision+1`（撤销删除/回收站） | task |
| `project.upsert` | `{id?, name, description?, kind?, status?, color?, areaId?, reviewIntervalDays?}` | 有 id 则更新，无则创建 | project |
| `project.softDelete` | `{id}` | 项目墓碑；**任务不删除**，`projectId` 由后续操作解绑 | project |
| `project.markReviewed` | `{id}` | 写 `lastReviewedAt = now` | project |
| `context.upsert` | `{name, color?, icon?}` | 按名 find-or-create（去 `@`、trim、大小写不敏感） | context |
| `section.create` | `{projectId, name}` | 项目内新建分区，`orderKey` 追加 | section |
| `area.upsert` | `{id?, name, color?}` | 区域创建/改名 | area |
| `area.softDelete` | `{id}` | 区域墓碑；项目 `areaId` 回落未分组 | area |
| `template.upsert` | `{id?, name, title, notes?, priority?, projectId?, contextIds?, tags?, checklist?, recurrence?}` | 有 id 更新；无 id 按名 find-or-create | template |
| `template.softDelete` | `{id}` | 模板墓碑（revision+1） | template |
| `template.instantiate` | `{id}` | 单事务按模板建任务；checklist 子项重新生成 id；模板 revision 不变 | task |
| `attachment.add` | `{taskId, fileName, mimeType?, size?, storagePath}` | 只登记元数据 | attachment |
| `attachment.remove` | `{id}` | 附件墓碑 | attachment |
| `settings.set` | `{key, value: string\|number\|boolean\|null}` | 写 kv（值统一 `String()`）；返回空数组 | — |
| `sync.applyRemote` | `{records: TaggedRecord[]}` | 远端记录合并（revision 决胜），每批一个事务 | 实际写入的记录 |
| `import.merge` | `{records: TaggedRecord[]}` | 与 `sync.applyRemote` 同一路径（导入 JSON 全量 dump） | 实际写入的记录 |

### 7.3 典型调用

```ts
// 快速捕获
await runCommand("task.create", {
  title: "给张总发周报",
  status: "next",
  priority: 2,
  dueAt: Date.now() + 86400000,
  contextIds: [computerContextId],
  tags: ["本周"],
});

// 批量完成：逐条命令 + 一次撤销
for (const id of selectedIds) await runCommand("task.complete", { id });
showUndo("已批量完成 3 条", async () => {
  for (const id of selectedIds) await runCommand("task.uncomplete", { id });
});
```

### 7.4 错误模型

```ts
type AppErrorCode =
  | "validation_failed"   // zod 校验失败（payload 结构不对）
  | "not_found"           // 目标记录不存在
  | "conflict"            // 合并/唯一约束冲突
  | "storage_failed"      // SQLite 写入失败
  | "network_failed"      // 同步通道失败
  | "forbidden"           // IPC/路径/权限拒绝
  | "unknown";

class AppError extends Error { code: AppErrorCode; details?: unknown }
```

- `executeCommand` 捕获所有异常并 `toAppError()` 归一，保留原始 message；
- 桌面 IPC 把 `AppError` 转成可序列化的 `{ code, message }` 再抛给渲染进程；
- UI 层按 code 决定呈现：`validation_failed` → 表单内联错误；`network_failed` → toast + 重试；其余 → toast + 写入 `store.lastError`。

### 7.5 IPC 白名单

桌面端主进程维护 `COMMAND_OP_FLAG: { [K in CommandOp]: true }`，启动时 `Object.keys` 生成允许列表：

- 未注册 op → 直接抛错，不进入事务；
- payload 必须是对象（防原始值/函数注入）；
- 命令在 `enqueueDb` 串行队列里执行，避免并发事务。

**新增命令的完整清单**：schema（models/commands.ts）→ handler（db/commands/<domain>.ts）→ 注册表（db/commands/index.ts）→ 桌面白名单（main/ipc.ts 的 COMMAND_OP_FLAG）→ 测试（ipc-serializable + 领域用例）。任何一步缺失都会被类型系统或测试挡住。

---

## 8. 核心算法

所有算法都是 `packages/core` 里的**纯函数**：输入 state/参数 + 可注入的 `now`，输出确定结果。不读系统时钟、不访问 DOM、不产生副作用——因此可以在 Node/Bun 里直接单测，也能在桌面主进程和移动渲染进程跑出同样结果。

### 8.1 自然语言快速添加（`features/quick-add.ts`）

**算法**：`parseQuickAdd(text, now)` 按固定顺序做**抽取式**解析——每识别一段语法就从文本中"切掉"它（替换为空格），全部抽完后的**残余文本就是标题**。因此语法可以任意混排，不要求固定位置。

```
输入: "给张总发周报 #工作 @电脑 !! 明天 下午3点 每工作日 +沟通"
      ├─ #工作        → projectName
      ├─ @电脑        → contextNames
      ├─ !!           → priority 2
      ├─ 明天+下午3点  → dueAt = 明天 15:00
      ├─ 每工作日      → recurrence = { freq: "weekdays", interval: 1 }
      └─ +沟通        → tags
输出: title = "给张总发周报"
```

**语法表**（中英混排，均可用空格分隔多个）：

| 语法 | 效果 | 边界 |
|---|---|---|
| `@电脑`（可多个） | 情境（find-or-create） | 名称去 `@`、trim |
| `#项目` | 归入项目（按名 find-or-create，并行类型） | 只取第一个 |
| `+标签`（可多个） | 标签（normalizeTag） | 去 `#@+>!`、压空白为 `-`、≤24 字符、大小写不敏感去重 |
| `!` / `!!` / `!!!` | 优先级 1/2/3 | 长匹配优先，避免 `!!` 被当成两个 `!` |
| `>张三` | `waitingFor = 张三`，并建议状态 waiting | — |
| `今天 / 明天 / 后天 / 大后天 / today / tomorrow` | 到期日，**统一默认 18:00** | 当天已过 18:00 仍然算今天（不自动顺延，避免意外） |
| `周X / 星期X / 礼拜X` | 本周对应日；已过则下周 | 周一为一周起点 |
| `下周X / next monday` | 下周对应日 | — |
| `N天后 / in N days` | 相对日期（N≥0） | — |
| `10月1日 / 10-01 / 2026-10-01` | 绝对日期；今年已过 → 明年 | 非法日期（2-30）不解析 |
| `上午9点 / 下午3点30 / 晚上8点 / 15:30 / 3pm / 9am` | 修饰当日时刻；无日期时默认今天 | 无时刻统一 18:00 |
| `每天 / 每日 / daily` | daily interval=1 | — |
| `每周 / 每周X / 每周一三` | weekly（interval=1，byWeekday） | 紧凑与空格分隔均可 |
| `双周 / 每两周 / biweekly` | weekly interval=2 | — |
| `每月N日 / monthly` | monthly；首次 = 本月 N 日，已过则下月 | N 超出当月天数时 clamp 到月末 |
| `每年M月D日 / yearly` | yearly；首次 = 今年该日，已过则明年 | 2-29 在平年 clamp 到 2-28 |
| `每月最后工作日` | monthly + `lastWeekday=true` | 优先于日序 |
| `每工作日` | weekdays（跳过周末） | — |
| `每N天` / `每隔N天` | daily interval=N；`每隔1天` = 2 | N≥1（每隔 ≥1 → 实际最小 2） |
| `完成后N天` | afterCompletion interval=N | 以完成时刻为锚点 |
| `重复N次` | `remainingCount=N`，可与任意 freq 叠加 | 归零判定在 `task.complete` |

**归一化**：标题压缩连续空白并 trim；标题为空则拒绝创建（`validation_failed`）；解析不出的部分原样保留在标题里，**绝不静默丢弃用户输入**。

### 8.2 重复规则（`features/recurrence.ts`）

```ts
interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly" | "yearly" | "weekdays" | "afterCompletion";
  interval: number;               // ≥1
  byWeekday?: number[];           // 0=周日 … 6=周六，仅 weekly
  lastWeekday?: boolean;          // monthly：当月最后一个工作日
  remainingCount?: number | null; // null = 无限
  until?: number | null;          // 超过即终止
}
```

`nextOccurrence(anchor, rule, now)` 返回**严格晚于 `max(anchor, now)` 的第一个合法时刻**，迭代上限 1000 步（防御异常规则导致死循环）。

| freq | 推进语义 | 关键边界 |
|---|---|---|
| `daily` | `anchor + interval×1day`，循环直到 > floor | 保留原时刻（`atPreservedTime`） |
| `weekly` | 在 `byWeekday` 集合里找下一个命中日；`interval>1` 按自然周倍数推进 | 无 `byWeekday` 时取 anchor 的星期几 |
| `monthly` | 月份 `+interval`，日序 `min(dayOfMonth, 当月天数)` | `lastWeekday` 时取当月最后一个周一至周五 |
| `yearly` | 年份 `+interval`，2-29 在平年 clamp 到 2-28 | 保留月日与时刻 |
| `weekdays` | 从 floor 次日逐日找第一个非周六日 | 跨周末自动跳过 |
| `afterCompletion` | 以 `startOfDay(now) + 1day + (interval-1)day` 为基准 | 与 dueAt 无关，完成才起算 |

**完成语义**（`task.complete`）：

```
rule == null            → status=done, completedAt=now
rule != null:
  remaining = rule.remainingCount - 1（null 表示无限）
  next = remaining <= 0 ? null : nextOccurrence(dueAt ?? now, rule, now)
  next != null → 原记录推进：dueAt=next, completedAt=null, lastCompletedAt=now,
                 recurrence.remainingCount=remaining
  next == null → 真正完成：status=done, completedAt=now, remainingCount=0
```

**无到期日的重复任务**：以完成时刻为锚点推进（`anchor = dueAt ?? now`），不会因为"没有 dueAt"而永远不推进。

**已知取舍**：`weekly + interval>1 + 多 byWeekday` 的"第 N 周的第几个星期几"采用自然周近似（见代码注释），个人 GTD 场景足够；若未来需要严格 RRULE 语义，应替换为 RRULE 引擎而不是继续打补丁。

### 8.3 视图派生（`store/selectors/`）

| 视图 | 规则 | 排序 |
|---|---|---|
| 收集箱 | `status=inbox` 且 `!isDeferred` | `orderKey` |
| 今天 | 未完成、`dueAt ≤ 今天 23:59:59.999`、`!isDeferred` | `dueAt` 升序 |
| 即将 | 未完成、`dueAt ∈ [明天 00:00, 今天+14天)`、`!isDeferred` | 按天分组，组内 `dueAt` |
| 专注 | 今日到期 ∪ `starred` 未完成，去重 | starred 优先，再 `orderKey` |
| 项目 | `projectId = 项目` 且（done 或 `!isDeferred`） | `orderKey` |
| 等待中 / 将来也许 | 对应 status 且 `!isDeferred`（将来也许不看 defer） | `orderKey` |
| 回收站 | `deletedAt != null`，按 `deletedAt` 倒序，上限 200 | — |

**下一步行动**：顺序项目 = 第一个未完成任务；并行项目 = 优先 `status=next`，否则第一个未完成。

**React 纪律**：返回新对象/新数组的派生（如按区域分组）**禁止**直接传给 `useAppStore(useShallow(...))`——浅比较恒不相等会触发 React #185 死循环。正确写法是 `selectAreas` + `selectActiveProjects` + `groupProjectsByArea` + `useMemo`。

### 8.4 全局搜索（`features/search.ts`）

**评分层级**（同一命中只取最高层，不叠加）：

| 命中位置 | 分数 |
|---|---|
| 标题全等 | 100 |
| 标题前缀 | 70 |
| 标题包含 | 50 |
| 笔记包含 | 30 |
| 标签/情境命中 | 25 |

排序：分数降序 → `updatedAt` 降序 → `id` 字典序（保证确定性）。
`snippet`：命中位置前后各 20 字符，压缩换行与连续空白；`matchedField` 供 UI 显示来源徽标。
空 query → 空结果（不做"全量列出"，避免误触发大列表渲染）。
大小写不敏感；中文按码点匹配（`toLowerCase` 不改变中文），中英混排同一规则。

### 8.5 理清决策树（`features/clarify.ts`）

GTD 的"理清"是**逐条处理收件箱**的过程。实现为可解释的规则表，每条推荐都带 `reasonCode`（同时是 i18n 键，UI 直接翻译成一句"为什么"）：

| 顺序 | 条件 | 推荐动作 | reasonCode |
|---|---|---|---|
| 1 | `deletedAt != null` | `trash` | `clarify.reason.deleted` |
| 2 | `status = done` | `done` | `clarify.reason.done` |
| 3 | `status = waiting` | `waiting` | `clarify.reason.statusWaiting` |
| 4 | `status = someday` | `someday` | `clarify.reason.statusSomeday` |
| 5 | `status = next` | `next` | `clarify.reason.statusNext` |
| 6 | `waitingFor` 非空 | `waiting` | `clarify.reason.waiting` |
| 7 | 命中"2 分钟"信号（标签精确匹配 `2分钟/2min`，或标题/笔记出现 `2 分钟`，排除 `12 分钟`） | `twoMinute` | `clarify.reason.twoMinute` |
| 8 | 无项目 且 多步（checklist ≥2 或笔记 ≥2 条列表/编号步骤） | `project` | `clarify.reason.multiStep` |
| 9 | 无到期 且 无项目 | `someday` | `clarify.reason.noDueNoProject` |
| 10 | 到期在 0–7 天内 | `defer` | `clarify.reason.dueWithin7Days` |
| 11 | 已逾期 | `next` | `clarify.reason.overdue` |
| 12 | 其余可行动 | `next` | `clarify.reason.actionable` |

设计要点：
- **先尊重用户已表达的状态**（3–5 条），再给建议——不推翻用户已经做过的理清；
- 规则只使用任务**自身可观察的信号**（状态、标签、清单、项目、到期日），不猜测意图；
- `clarifyOptions` 永远返回全部 9 个动作（固定顺序），`recommended` 只做高亮，不限制选择——**建议可解释，但不代替人决策**；
- `clarifyProgress(state)` 返回 `{ inboxCount, processedToday, oldestInboxAgeDays }`：`processedToday` 以"今天有更新且已离开 inbox"近似（无事件日志），`oldestInboxAgeDays` 驱动"积压最久"提示。

### 8.6 统计口径（`features/stats.ts`）

口径必须可解释，否则用户不会信任数字：

| 指标 | 定义 |
|---|---|
| 完成时间 | `completedAt ?? lastCompletedAt`（普通任务取前者，重复任务取后者） |
| 7 / 30 天窗口 | 含今天在内的最近 7 / 30 个自然日（本地时区），从当天 00:00 起算 |
| `completionRate7d` | `7 天完成数 ÷ (7 天完成数 + 7 天内创建且仍未完成数)`；分母为 0 时返回 0，结果 clamp 到 0..1 |
| `streakDays` | 从今天（今天无完成则从昨天）向前连续有完成记录的天数；断一天即归零 |
| `throughputPerDay` | `completed7d ÷ 7`，保留两位小数 |
| `dailyBuckets` | 默认 7 天，可传 `days`（1..365），每桶 `{dayStart, completed, created}` |
| `byProject` | 每个活跃项目的 `{open, done}`（含已完成计数，按未完成降序展示） |
| `byContext` | 每个情境下的未完成任务数 |

空库不抛错，返回全 0 + 固定长度日桶（图表不需要额外兜底）。

### 8.7 四象限（`features/matrix.ts`）

| 维度 | 定义 |
|---|---|
| **重要** | `priority >= 2` 或 `starred` 或（有 `dueAt` 且属于活跃项目） |
| **紧急** | `dueAt` 距今 ≤ 48 小时（含逾期） |
| 象限 | q1 重要且紧急 / q2 重要不紧急 / q3 紧急不重要 / q4 既不重要也不紧急 |

`groupByQuadrant(tasks, now, projects)` 固定返回 q1..q4 四组（空组也返回空数组），组内按 `dueAt` → `orderKey` → `id` 排序。`projects` 可选：传入时按项目活跃性判定，不传时把非空 `projectId` 视为项目成员。

**为什么这样定义**："重要"必须能从用户已有行为推导（优先级、星标、是否挂在项目上），而不是让用户再填一次问卷；"紧急"用 48 小时窗口，覆盖"今天+明天"的真实紧迫感。

### 8.8 导出器（`features/exporters.ts`）

| 函数 | 输出 | 规范 |
|---|---|---|
| `toMarkdown(state, opts)` | Markdown 清单 | 按「区域 → 项目 → 任务」分组，无项目任务进「收集箱」；`- [ ]` 复选框；标题中的 `[` `]` 转义；可选 `includeCompleted`、`includeNotes` |
| `toICS(tasks, now)` | iCalendar | 仅导出有 `dueAt` 的未删除任务；`DTSTART = dueAt`、`DTEND = dueAt + 30min`；`UID = <taskId>@gtd`（稳定，重复导出不产生重复事件）；CRLF 行尾；75 octet 折行；转义 `\ ; ,` 与换行 |
| `toBackupJSON(state, now)` | 备份 JSON | store 快照（不含附件）；信封与导入一致：`{ app:"gtd", version:1, exportedAt, records:[{type,record}] }`；记录按 id 排序，2 空格缩进 |
| `formatBackupJSON(records, now)` | 备份 JSON | 完整备份用：`collectLocalRecords()`（含附件元数据）+ 同一信封格式化；同输入逐字节相同 |

已知取舍：ICS 使用**本地时间**（无 `TZID`/`VTIMEZONE`），跨时区导入时按"浮动时间"处理；对个人日程足够，若要做会议邀请需补 VTIMEZONE。

### 8.9 同步合并（`sync/merge.ts`）

```
① 交换 manifest：id → { revision, updatedAt, deletedAt }
② 差异拉取：idsToFetch(mine, theirs) —— 不信任时间窗，凡 revision/updatedAt/deletedAt 任一不同就取整条
③ 逐条决胜 compareEntries：
      revision 高者胜
   →  revision 相同则 updatedAt 新者胜（仅 tiebreak，容忍时钟偏差）
   →  再相同则 id 字典序小者胜（确定性兜底）
④ 墓碑按普通记录参与比较：被更高 revision 的编辑击败则"复活"（文档化语义）
⑤ 写入：sync.applyRemote 每批 ≤300 条，每批一个独立 immediate 事务，绝不与用户命令共享事务
⑥ 日志：kv["sync.log"] 记录 应用/本地胜/远端胜 + 冲突清单，More 页可查
```

### 8.10 到期通知扫描（`features/due-scan.ts`）

| 类型 | 触发条件 | 去重键 |
|---|---|---|
| 每日到期概览 | 当天到期且未完成、未提醒过 | `due.<date>` |
| 定时提醒 | 带具体时刻的任务，在 `dueAt - 5min` 窗口内 | `timed.<id>:<dueAt>` |
| 扫描节奏 | 每 60 秒轮询一次（移动端前台 + 桌面主进程） | — |

纯日期任务（`dueAt` 落在 18:00 默认时刻且用户未显式设时刻）不触发定时提醒，只进每日概览——避免深夜打扰。

### 8.11 每周回顾汇总（`features/review.ts`）

### 8.12 导入器（`features/importers.ts`）

把外部文本解析成"可执行的任务草稿"，**不落库、不生成 id**——由应用层逐条走命令。

| 函数 | 输入 | 规则 |
|---|---|---|
| `detectImportFormat(text)` | 任意文本 | 有 `TYPE,CONTENT` 表头 → `todoist`；有 `- [ ]` 或 `# 标题` → `markdown`；否则 `unknown` |
| `parseMarkdownTasks(text, now)` | Markdown | `# 项目` 作分组标题；`- [ ]` / `- [x]` 作任务（x = 已完成）；缩进的普通列表行并入上一条任务笔记 |
| `parseTodoistCSV(text, now)` | Todoist 导出 CSV | 只导入 `TYPE=task`；`PRIORITY` P1–P4 → 3–0；`DUE DATE` 支持 `YYYY-MM-DD[ HH:mm]`；`LABELS` 按逗号/分号拆分；`PROJECT` 收集为项目；`DESCRIPTION` 作笔记 |
| `parseTickTickCSV(text, now)` | TickTick 导出 CSV | `Title` 作任务、`Content` 作笔记、`List`/`Folder` 作项目、`Status` 判完成；优先级兼容 `高/中/低/无` 与 `High/Medium/Low/None` |
| `parseGenericCSV(text, now, mapping)` | 任意 CSV | 调用方显式给出列映射（`CsvColumnMapping`：title/notes/priority/due/tags/project/status）；缺列只警告不抛错 |
| `parseCSVRows(text)` | CSV | 正确处理引号字段、字段内逗号/换行、`""` 转义、CRLF |
| `parseImportDate(raw)` | 日期串 | 严格校验（2 月 30 日被拒绝）；无时刻默认 18:00 |
| `normalizeImportPriority(raw)` / `normalizeImportCompleted(raw)` | 单值 | 统一 Todoist P1–P4、TickTick 0–3、中英文标签的优先级与完成态语义 |
| `parseImportText(text, now)` | 统一入口 | 自动识别（Todoist / TickTick / Markdown / 通用 CSV）并分派 |

设计要点：
- **复用 `parseQuickAdd`**：标题里的 `@情境` `+标签` `!!` `明天` 照常生效，用户在外部文件里写的标记不丢；
- 单条坏行跳过并计入 `warnings`/`skipped`，不因一行脏数据中断整次导入；
- 上限 5000 条（`IMPORT_TASK_LIMIT`），防止误选大文件把内存打爆；
- 导入策略：项目 find-or-create → 逐条 `task.create`（每条一个 immediate 事务）→ 已完成条目补 `task.complete`；失败即停止并报告已完成数量。

`buildReviewSummary(state, now)` 输出六步向导所需的全部数据：收集箱计数、无下一步行动的项目、近 7 天完成、未来 14 天到期、等待中、将来也许、超期未回顾项目（`now - lastReviewedAt > reviewIntervalDays`）、8 周完成趋势。

---

## 9. 状态管理

### 9.1 Store 形状

```ts
interface AppState {
  loaded: boolean;                       // bootstrap 完成
  tasks: Record<string, Task>;           // 以 id 为键，O(1) 定位
  projects: Record<string, Project>;
  sections: Record<string, Section>;
  contexts: Record<string, Context>;
  areas: Record<string, Area>;
  kv: Record<string, string>;            // 设置（不参与同步）
  lastError: string | null;
}
```

- `zustand/vanilla` 创建（`createStore`），**core 里没有 React**；
- React 绑定只有一处：`packages/ui/src/hooks/useAppStore.ts`，内部 `useStore(appStore, useShallow(selector))`。

### 9.2 写路径

```
runCommand(op, payload)
  → getCommandPort().dispatch(op, payload)     // 移动：本地执行；桌面：IPC
  → applyRecords(result.records)               // 只做增量合并，不重新拉全量
  → settings.set 额外同步写 kv（通知去重键等需要即时可见）
  → 失败：store.lastError = message，重新抛出
```

`applyRecords` 的规则：`deletedAt !== null` 的记录从对应切片删除；否则写入。附件元数据不进全局状态（详情页按需查询）。

### 9.3 Bootstrap

`bootstrapStore()` 一次性载入全部未删除记录 + kv，随后异步触发墓碑压缩（每日至多一次，失败静默）。全量载入的取舍见 §4.6：本地 GTD 数据规模有限，换来筛选/搜索零延迟。

### 9.4 Selector 纪律（血泪版）

| 规则 | 原因 |
|---|---|
| selector 必须是纯函数，只读 state | 可测试、可缓存 |
| 返回新对象/新数组的 selector **禁止**直接喂 `useAppStore(useShallow)` | 浅比较恒不相等 → React #185「Maximum update depth exceeded」→ 整页白屏 |
| 派生结构用 `useMemo` 组合基础 selector | 先例：`groupProjectsByArea` |
| 排序/过滤在 selector 里做，不在渲染中做 | 避免每次 render 重排 |

```ts
// ✅ 正确
const areas = useAppStore(selectAreas);
const projects = useAppStore(selectActiveProjects);
const groups = useMemo(() => groupProjectsByArea(areas, projects, allAreas), [areas, projects, allAreas]);

// ❌ 错误：每次调用返回新数组
const groups = useAppStore(selectProjectsByArea);
```

### 9.5 其他 store

| Store | 位置 | 用途 |
|---|---|---|
| `appStore` | core | 业务数据 |
| `toastStore` | ui/theme/feedback | 全局单条 Toast |
| `undoStack`（模块级） | ui/components/UndoBar + lib/undo-stack | 有界撤销栈（10 条 / 60 秒 TTL），Ctrl+Z 逐层回退 |
| `promptStore` | ui/components/PromptHost | 跨端 prompt/confirm 队列 |
| `paletteStore` | mobile/platform | 命令面板开关状态 |

这些是**纯 UI 状态**，不进 core、不参与同步。

---

## 10. UI 设计系统 v2

### 10.1 视觉语言：「纸与墨」Calm Productivity

三句话概括 v2：

1. **纸**：暖中性底色（`#F7F5F1`），纯白内容面，1px 发丝边框分层——不用重阴影把界面压得喘不过气。
2. **墨**：排版建立层级（hero 28 → caption 11），正文 16/24；cobalt blue 只做"可操作"的信号，不做装饰。
3. **静**：动效 120/200/320ms，只做透明度与轻微位移；尊重系统"减弱动态效果"。

反模式清单（评审直接打回）：
- 卡片叠卡片、每层都加阴影；
- 用颜色表达优先级之外的情绪（成功/警告/危险之外不引入第五种语义色）；
- 文字用 `<Text>` 直出、字号写死；
- 图标按钮无 `accessibilityLabel`；
- 动画做布局位移（会导致列表跳动与手势冲突）。

### 10.2 Token 表

**间距（4/8 栅格）**

| token | 值 | 典型用途 |
|---|---|---|
| `space.none` | 0 | 重置 |
| `space.xxs` | 2 | 图标与文字微距 |
| `space.xs` | 4 | 行内元素间距 |
| `space.sm` | 8 | 组件内边距（紧凑） |
| `space.md` | 12 | 卡片内边距（紧凑） |
| `space.lg` | 16 | 标准内边距 / 页面左右边距 |
| `space.xl` | 20 | 分组间距 |
| `space.xxl` | 24 | 区块间距 |
| `space.xxxl` | 32 | 页面级留白 |
| `space.huge` | 40 | 空态/大区块 |

**圆角**：`xs 6 / sm 10 / md 14 / lg 20 / xl 24 / pill 999`。输入框与按钮用 `sm`，卡片用 `md`，抽屉顶部用 `lg`，胶囊标签用 `pill`。

**字号阶梯**

| variant | 字号/行高 | 字重 | 用途 |
|---|---|---|---|
| `hero` | 28/36 | 700 | 页面主标题、统计大数字 |
| `display` | 24/32 | 700 | 区块标题、空态标题 |
| `title` | 20/28 | 600 | 页面标题 |
| `subtitle` | 17/24 | 600 | 卡片标题、列表组头 |
| `body` | 16/24 | 400 | 正文、任务标题（默认） |
| `bodyStrong` | 16/24 | 600 | 强调正文、按钮文字 |
| `label` | 13/18 | 500 | 元信息、表单标签 |
| `caption` | 11/16 | 500 | 辅助说明、时间戳 |
| `mono` | 14/21 | 400 | 数字、代码、日期对齐 |

**触控与固定高度**

| token | 值 | 说明 |
|---|---|---|
| `hit.min` | 44 | 最小触控目标（所有可点元素） |
| `hit.row` | 56 | 列表行高 |
| `hit.nav` | 48 | 导航条目 |
| `hit.button` | 46 | 主按钮 |
| `hit.buttonSm` | 36 | 小按钮（仍需 `hitSlop` 补足 44） |
| `hit.tabBar` | 62 | 底部 Tab |
| `hit.toolbar` | 52 | 顶部工具栏 |

**响应式断点**：`compact 0 / medium 768 / wide 1024 / ultra 1440`。

**层级**：`base 0 / sticky 10 / overlay 100 / modal 200 / toast 300`。

**动效**：`fast 120 / base 200 / slow 320`；缓动 `cubic-bezier(0.2,0,0,1)`（standard）、`cubic-bezier(0.3,0,0,1)`（emphasized）。

### 10.3 颜色语义

亮色（`lightColors`）：

| 语义位 | 值 | 用途 |
|---|---|---|
| `canvas` | `#F7F5F1` | 页面底 |
| `surface` | `#FFFFFF` | 卡片、列表 |
| `surfaceMuted` | `#F0EDE7` | 输入框、分段控件底 |
| `surfaceOverlay` | `#FFFFFF` | 浮层表面 |
| `text` | `#1A1A18` | 主文本 |
| `textSecondary` | `#5A5750` | 次要文本 |
| `textTertiary` | `#6E6A62` | 辅助文本（≥3:1） |
| `primary` | `#1D4ED8` | 可操作、选中、链接 |
| `primaryMuted` | `#E7ECFB` | 选中底、高亮底 |
| `onPrimary` / `textOnAccent` | `#FFFFFF` | 实心按钮文字 |
| `border` | `#D8D4CB` | 发丝边框 |
| `borderStrong` | `#C9C4BA` | 复选框等需要可辨识的线 |
| `danger` | `#B42318` | 删除、逾期 |
| `success` | `#0F7B4F` | 完成、连接正常 |
| `warning` | `#96550A` | 今天到期、需注意 |
| `info` | `#0B6AA8` | 中性提示 |
| `neutralMuted` | `#EDEAE3` | 徽标/标签默认底 |
| `focusRing` | `#1D4ED8` | 键盘焦点环 |
| `scrim` | `rgba(20,19,16,0.45)` | 模态遮罩 |

暗色（`darkColors`）：`canvas #0E1013`、`surface #17191E`、`surfaceMuted #202329`、`text #F2F0EB`、`primary #8FA8FF`、`border #33363D`……完整值见 `packages/ui/src/theme/tokens.ts`。

对比度由 `__tests__/contrast.test.ts` 守护：正文 ≥4.5:1、次要文本 ≥3:1、边框可辨识 ≥1.3:1，亮暗各一套。新增颜色必须同时补测试。

### 10.4 组件清单

**原语（`theme/primitives.tsx`）**

| 组件 | 变体 | 要点 |
|---|---|---|
| `Button` | `primary / secondary / ghost / danger / quiet` × `sm / md / lg` | `icon`、`iconOnly`、`block`、`loading`；`iconOnly` 时 `label` 作为无障碍名 |
| `IconButton` | `plain / filled / ghost` × `sm / md / lg` | 必须有 `accessibilityLabel`；`hitSlop` 补足 44 |
| `Card` | `outline / raised / flat` × `padding none/compact/normal/roomy` | 默认 `outline`（无阴影） |
| `Divider` | `hairline / inset / section` | 用 `StyleSheet.hairlineWidth` |
| `Badge` | tone `neutral/accent/success/warning/danger/info` | 计数、状态标记 |
| `ProgressBar` | tone | `role="progressbar"` + `aria-valuenow` 语义 |
| `Skeleton` | 尺寸可传 | web CSS 微光、native Animated；减弱动态时静态 |
| `Tag` | 可移除 | 胶囊标签，删除按钮带 label |

**布局（`components/`）**

| 组件 | 作用 |
|---|---|
| `AppShell` | 响应式外壳：<768 单栏；≥768 侧栏 232 + 主轨（max 880）；≥1180 且传 `detail` 时三栏（详情 400） |
| `Screen` / `PageHeader` / `SectionHeader` / `SegmentedWrap` | 页面容器、标题栏、分组头、分段容器 |
| `TwoPaneLayout` | 列表/详情双栏（项目详情用） |
| `SegmentedControl` | 受控分段控件（tablist 语义、方向键） |
| `Sheet` | 底部抽屉；web ≥768 居中 dialog（max 480） |
| `StatTile` | 统计卡片（label/value/delta/icon/tone） |
| `Highlight` | 搜索命中高亮（切分纯函数 `splitHighlight`） |
| `ToastHost` + `showToast` | 全局单条提示，可带 action |

**业务组件**

| 组件 | 职责 |
|---|---|
| `TaskRow` | 任务行：多选、左滑完成、右滑延后、拖拽手柄、状态色条、右键菜单 |
| `TaskList` | 列表容器：空态、分组、批量模式编排 |
| `QuickAddBar` | 快速添加输入 + 实时解析预览 |
| `FilterBar` | 关键词/情境/标签/逾期筛选（宽屏收进漏斗弹层） |
| `PerspectiveBar` | 保存的筛选（应用/保存/删除） |
| `KanbanBoard` | 四状态看板 + 跨列拖拽（PanResponder + 纯函数命中判定） |
| `CalendarView` / `TimelineView` / `UpcomingView` | 日历 / 时间轴 / 未来 14 天 |
| `TaskDetailContent` | 详情：状态/优先级/日期/项目/情境/标签/清单/笔记/附件/重复/星标 |
| `ProjectDetailContent` | 项目详情：分区、下一步行动高亮、回顾信息 |
| `ReviewWizard` | 六步每周回顾 |
| `CommandPalette` | Ctrl/Cmd+K 命令面板 |
| `Pomodoro` | 番茄钟（用目标时间戳计算剩余，避免定时器漂移） |
| `MarkdownView` | 自研 Markdown 渲染（行级扫描，链接仅 http/https） |
| `BulkActionBar` / `RowActions` / `OptionSheet` / `PromptHost` / `UndoBar` | 批量条、行尾动作、动作面板、跨端输入/确认、撤销条 |

### 10.5 布局规则

- **内容轨道**：宽屏主内容 max **880**，详情栏固定 **400**；页面左右内边距 16（紧凑）/ 24（宽屏）。
- **列表**：单卡片 + 发丝分隔线；行高 ≥56；行内元信息固定 20 高，不参与行高计算。
- **空态**：不套卡片，保留留白；标题 + 一句可行动提示 + 一个主按钮。
- **图标**：统一 Ionicons，禁止 emoji 当图标；图标尺寸 20（行内）/ 22（工具栏）/ 24（Tab）。
- **导航**：<768 底部 Tab（≤5 项，数字徽标）；≥768 侧栏；≥1180 三栏。三者同源于 `NAV_ITEMS`。

### 10.6 无障碍（A11y）

| 要求 | 实现/守护 |
|---|---|
| 触控目标 ≥44×44 | `hit.min` + `hitSlop`；静态审计 |
| 图标按钮必有 label | `a11y-audit.test.ts` 扫描 |
| 文本必须经 AppText | 静态审计禁止直接 `<Text>` |
| 颜色对比 ≥4.5:1 | `contrast.test.ts` |
| 键盘可达 + 焦点可见 | `useFocusStyle` 输出焦点环；Tab 序 = 视觉序 |
| 屏幕阅读器语义 | `accessibilityRole/State/Label`；Toast 用 `accessibilityLiveRegion="polite"` |
| 减少动效 | `useReducedMotion`，Skeleton/Sheet 降级为静态 |

### 10.7 文本原语（Android 大字体防御）

`AppText` 是**唯一文本原语**，四重锁定：

1. `allowFontScaling={false}`
2. `maxFontSizeMultiplier={1}`
3. 字号/行高来自 token（容器高度可预测）
4. 默认 `numberOfLines=1` + 省略

另两层防线：`installFontScaleOverride()`（全局）+ CI 注入 `MainActivity fontScale=1.0`。三层缺一不可——这是小米/HyperOS 大字体"文字叠成一团"的结构性解法。

### 10.8 主题与字体

- 主题：`theme.mode ∈ {system, light, dark}`，存 kv，`ThemeProvider` 解析后经 `useTheme()` 下发语义色；
- 字体：默认系统字体；内置霞鹜文楷（19.3MB TTF）为可选项，**按需懒加载**（bootstrap 后按 kv 判断，设置页切换时补载）；
- 字号不随系统缩放（见 §10.7），语言切换即时生效（`useT()` 订阅）。

---

## 11. 交互规范

### 11.1 手势

| 手势 | 位置 | 行为 | 阈值/约束 |
|---|---|---|---|
| 左滑 | 任务行 | 完成（可撤销） | 72px 触发，松手吸附 |
| 右滑 | 任务行 | 延后到明天 9:00（可撤销） | 同上 |
| 长按 | 任务行 | 进入多选模式 | 250ms |
| 长按拖动 | 排序模式手柄 | 拖拽排序 | 位移 >6px 才真正开始 |
| 长按拖动 | 看板卡片 | 跨列改状态 | 220ms 进入拖拽，卡片中心命中列区间 |
| 点击空白 | 浮层 | 关闭 | — |

约束：手势不改变行高；滑动与纵向滚动用主轴判定（`|dx| > |dy| × 1.5`）互斥；拖拽期间禁用横向滚动。

### 11.2 键盘（桌面）

| 快捷键 | 行为 |
|---|---|
| `Ctrl/Cmd + N` | 新建任务 |
| `Ctrl/Cmd + K` | 命令面板 |
| `Ctrl/Cmd + Shift + K` | 快速收集（全局） |
| `Ctrl/Cmd + Shift + Space` | 全局快速收集（系统级） |
| `Ctrl/Cmd + Shift + S` | 立即同步 |
| `Ctrl/Cmd + Shift + R` | 每周回顾 |
| `Ctrl/Cmd + F` | 搜索 |
| `Ctrl/Cmd + Shift + F` | 专注 |
| `Ctrl/Cmd + Shift + B` | 本地备份 |
| `↑ / ↓` | 列表/面板选择 |
| `Enter` | 打开选中项 |
| `Esc` | 关闭面板/返回 |
| `1 – 9` | 理清向导的动作快捷键 |

所有快捷键在输入框聚焦时不拦截（`useKeyboardShortcuts` 判断 target）。

### 11.3 命令面板

- 模糊打分：全等 100 > 前缀 80 > 包含 60 > 子序列 30；
- 结果：任务 8 条 + 项目 4 条 + 「新建任务：xxx」兜底；
- 三处入口共享 `paletteStore`（桌面菜单、渲染层键盘、移动端）；
- 键盘：↑↓ 选择、Enter 打开、Esc 关闭。

### 11.4 批量与撤销

- 多选后底部出现 `BulkActionBar`：完成 / 移动 / 删除 / 取消；
- 批量 = **逐条命令**执行，任一失败即停止并报告已成功的条数；
- 一次撤销回滚整批（保存反向命令列表）；
- 撤销条：`showUndo(message, rollback)` 入栈（最多 10 条、60 秒有效），`Ctrl+Z` 或点击按钮逐层回退；栈空后提示条自动消失。

### 11.5 反馈分层

| 场景 | 组件 | 时长 |
|---|---|---|
| 操作成功（可撤销） | `UndoBar` | 5s |
| 操作成功（不可撤销）/ 轻提示 | `Toast` | 3.2s |
| 需要确认 | `showConfirm`（跨端 Modal） | 用户决定 |
| 需要输入 | `showPrompt`（跨端 Modal） | 用户决定 |
| 破坏性操作 | `showConfirm` + danger 按钮 | 用户决定 |
| 页面级错误 | 内联错误块 + 重试按钮 | 常驻 |

**为什么不用 `Alert.alert` / `window.prompt`**：`Alert.alert` 在 react-native-web 是空实现（曾导致桌面端删除确认静默失效）；`window.prompt` 在 RN 原生不存在。统一走 `PromptHost`。

### 11.6 状态呈现

| 状态 | 呈现 |
|---|---|
| 加载中 | `Skeleton`（列表骨架 5 行；统计卡片骨架），不用转圈占满屏 |
| 空 | `EmptyState`：标题 + 一句提示 + 主按钮（可行动） |
| 无结果（筛选） | 「没有匹配的任务」+ 清除筛选 |
| 错误 | 内联错误文案 + 重试；`lastError` 同时 toast |
| 离线/同步失败 | 顶部细条提示（不阻断使用），More 页可查同步日志 |
| 后台刷新 | 不显示 loading（避免闪烁），完成后静默替换 |

### 11.7 深链

`gtd://add?title=买牛奶` → 打开应用并预填快速添加。桌面经 `app://` 协议内部路由，移动经 Expo Linking 配置。深链参数只接受字符串并做长度截断（≤2000）。

---

## 12. 平台适配层

### 12.1 Expo（移动 + web 渲染层）

**路由表**（Expo Router）

| 路由 | 页面 |
|---|---|
| `/(tabs)/index` | 收集箱（列表/看板） |
| `/(tabs)/today` | 今天（日历/即将/Timeline） |
| `/(tabs)/focus` | 专注（星标 + 番茄钟） |
| `/(tabs)/projects` | 项目（按区域分组） |
| `/(tabs)/more` | 更多（回顾/洞察/清理/同步/数据/外观） |
| `/task/[id]` | 任务详情 |
| `/project/[id]` | 项目详情 |
| `/process` | 理清向导 |
| `/onboarding` | 首启引导（三屏；`kv["onboarding.done"]` 门控，已有任务的老用户不触发） |
| `/recent` | 最近操作（撤销栈可视化：撤销上一步 / 全部撤销） |
| `/settings` | 设置（主题 / 字体 / 语言 / 关于） |
| `/data` | 数据（导出 3 种 / 导入 2 种 / 本地与云备份） |
| `/search` | 全局搜索 |
| `/insights` | 统计面板 |
| `/matrix` | 四象限 |
| `/review` | 每周回顾 |
| `/completed` | 完成记录 |
| `/trash` | 回收站 |
| `/add` | 快速添加（深链落地） |
| `/import` | 导入（Markdown / Todoist / TickTick CSV 粘贴） |
| `/templates` | 任务模板（查看/新建/实例化/删除） |

> 移动端导出落地方式：Android「保存」走系统文件选择器（SAF，文件真落在用户选的目录），
> 「分享」写沙盒 `documentDirectory` 后交给系统分享面板；桌面走 `dialog.save`。
> `saveTextFile` 返回 `{ path, mode: "saved" | "shared" }`，UI 据此提示文件名而不是裸路径。
| `/about` | 关于 |

**端口注入**（`platform/bootstrap.ts`）：启动时把平台实现注入 core 的端口单例——`SqliteExecutor`、`NotificationsPort`、`FilesPort`、`SharePort`、`DeepLinkPort`；core 只认接口，不认 expo 模块。

**移动专属**：
- 附件：DocumentPicker → 复制进 `documentDirectory/attachments/`（`content://` 授权是临时的，必须复制）；
- 数据出口：`expo-sharing` 分享 JSON/Markdown/ICS；
- 字体缩放三层防御（§10.7）；
- 通知：本地通知 + 60s 扫描。

### 12.2 Electron（桌面）

**preload 暴露的 `window.gtd`**

| 命名空间 | 方法 | 说明 |
|---|---|---|
| `command` | `(op, payload)` | 唯一写入口，白名单校验 |
| `query` | `(sql, params)` | SELECT-only 校验 |
| `window` | `show/hide/toggle/minimizeToTray` | 窗口控制 |
| `shortcuts` | `register(accelerator, actionId)` | 全局快捷键 |
| `notify` | `({title, body, taskId})` | 原生通知 + 点击回调 |
| `dialog` | `open({directory?, filters?})` / `save({defaultPath?})` | 文件选择（选定即授权根） |
| `fs` | `readFile / writeFile / listDir` | 限定 `allowedRoots` |
| `sync` | `setFolderRoot(root)` | 文件夹同步根 |
| `backup` | `now / list / restore` | 本地备份 |
| `secret` | `encrypt / decrypt` | safeStorage 加解密 |
| `menu` | `context(items, pos)` | 原生右键菜单 |
| `app` | `getInfo / quit` | 应用信息 |
| `on` | 事件订阅（白名单通道） | `tray:quick-add`、`shortcut:triggered`、`notification:click`、`menu:action`、`window:focusChange`、`command:applied` |

**主进程模块**（v2 拆分后）

| 模块 | 职责 |
|---|---|
| `main.ts` | 生命周期编排（74 行，只做顺序接线） |
| `state.ts` | 主进程单例状态（窗口/DB/托盘/退出标记/允许根） |
| `ipc.ts` | 全部 IPC 注册、命令白名单、串行队列、只读校验、路径白名单 |
| `window.ts` | 创建窗口、`app://` 协议、SPA fallback、显隐切换、全局快捷键 |
| `menu.ts` | 应用菜单 + 托盘菜单（随语言重建） |
| `backup.ts` | `VACUUM INTO` 快照、保留 7 份、自动备份定时器 |
| `updater.ts` | electron-updater 检查（打包后才生效） |
| `smoke.ts` | `--smoke` 冒烟与 `--shot` 离屏截图 |

**安全边界**：渲染进程 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`；所有原生能力经 preload 白名单暴露；`app://` 协议解析拒绝目录穿越。

### 12.3 平台差异文件清单

| 文件 | 差异 |
|---|---|
| `platform/useKeyboardShortcuts.web.ts` | web 键盘监听（`ctrl` 匹配 CmdOrCtrl 语义） |
| `platform/useKeyboardShortcuts.ts` | native 空实现 |
| `DatePicker.web.tsx` / `.native.tsx` | 日期选择（native 用系统 picker） |
| `ContextMenu.web.tsx` / `.native.tsx` | 桌面原生右键 vs 移动动作面板 |
| `AttachmentPicker` | dialog vs DocumentPicker |
| `font-scale.ts` / `font-loader.ts` | 仅 native |
| `mobile-actions.ts` / `desktop-actions.ts` | 数据出口：分享 vs 文件对话框 |

新增平台分支前先问：能否用统一抽象（端口 + 默认实现）解决？只有"必须调原生 API"才允许分文件。

---

## 13. 同步与备份

### 13.1 数据布局

```
<sync-root>/
└─ devices/
   ├─ <deviceA>/
   │  ├─ manifest.json     # { recordId: { revision, updatedAt, deletedAt } }
   │  └─ records.json      # TaggedRecord[]（含墓碑）
   └─ <deviceB>/…
```

各端**对等**：每台设备只写自己的目录，读其他设备的目录。没有中心节点，没有服务端逻辑，因此任何文件存储（网盘、S3、U 盘目录）都能当同步后端。

### 13.2 Provider

| Provider | 协议 | 关键实现 | 备注 |
|---|---|---|---|
| 坚果云（预设） | WebDAV | 预填 `https://dav.jianguoyun.com/dav/` | 邮箱 + 应用密码（非登录密码） |
| 自定义 WebDAV | WebDAV | 自写 fetch 客户端：`PROPFIND / MKCOL / PUT / GET` | 不用 axios（Bun + Expo 导出兼容性） |
| 自托管 HTTP | REST | 约定的 PUT/GET 路径 | 需自行实现同样布局的服务端 |
| 本地文件夹 | fs | Electron `FilesPort` | 桌面专用；可指向同步盘目录 |
| S3 兼容 | AWS SigV4 | Web Crypto 签名（`sync/s3.ts`） | 阿里云 OSS / 腾讯 COS / MinIO |

**SigV4 要点**：规范化请求（canonical request）→ 签名串 → HMAC-SHA256 派生密钥 → `Authorization` 头；时间戳来自设备时钟，偏差 >15 分钟会被服务端拒绝（错误提示需引导用户校时）。

### 13.3 同步流程

```
syncNow({provider, executor, deviceId, apply, onProgress})
 ① 本地 manifest = collectLocalRecords(executor)（含墓碑，全表扫描）
 ② 列出 devices/ 下其他设备目录，逐个 GET manifest.json
 ③ idsToFetch(本地 manifest, 远端 manifest) → 待取 id
 ④ 若待取非空：GET 远端 records.json，pickRecords 挑出待取记录
 ⑤ 按 300 条/批调用 sync.applyRemote（每批独立 immediate 事务）
 ⑥ PUT 自己的 manifest.json + records.json
 ⑦ 写 kv["sync.last"]、kv["sync.log"]（应用条数 / 本地胜 / 远端胜 / 冲突清单 / 耗时）
```

`onProgress` 在 ④⑤⑥ 阶段回调 `{phase, done, total, device?, deviceCount?}`，同步页据此显示
「正在合并记录 120/480」，避免大库首次同步看起来像卡死。

关键设计：
- **不信任时间窗**：只要 revision/updatedAt/deletedAt 任一不同就取整条，避免"设备时钟差 5 分钟就漏同步"；
- **批间释放事务**：绝不与用户命令共享事务，同步中途用户仍可正常操作；
- **幂等**：重复执行同一批 `applyRemote` 结果不变（revision 决胜）。

### 13.3.1 自动同步（v2.3）

调度逻辑在 `packages/core/src/sync/auto.ts`（纯函数 + 注入定时器，可测），接线在
`apps/mobile/src/platform/sync-scheduler.ts`（RN `AppState` + store 订阅）。

| 触发点 | 行为 |
|---|---|
| 应用启动 | 立即 markDirty（新设备第一次打开就能拉到云端数据） |
| 回到前台 | `AppState → active` 时 markDirty |
| 本地改动 | store 中 `tasks/projects/sections/contexts/areas/templates` 引用变化时 markDirty |
| 合并窗口 | 改动后 **20 秒** 合并，避免连续操作打爆网盘 |
| 最小间隔 | 两次自动同步至少 **60 秒** |
| 失败退避 | 5 分钟 × 失败次数，上限 30 分钟（退避结束自动重试一次） |
| 并发保护 | 同一时刻只允许一次同步；同步自身引起的 store 重建不算用户改动 |

开关：`kv["sync.auto"]`，缺省开启，`"0"` 为仅手动（更多 → 同步 → 自动同步）。

### 13.3.2 其他设备可见性（v2.3）

同步目录里只有 `devices/<id>/manifest.json` 与 records 快照，没有额外的"设备名片"。因此
`sync/devices.ts#describePeerDevices(provider, selfId)` 完全从已有产物推导，不新增文件格式：

| 展示项 | 推导方式 |
|---|---|
| 设备标识 | `device_id` 末 6 位（不伪造设备名） |
| 记录数 | 该设备 manifest 的 key 数量（含墓碑） |
| 最后活动时间 | manifest 里最大的 `updatedAt`（比文件 mtime 可靠：网盘会改写 mtime） |

同步页展开时与每次手动同步成功后各刷新一次；读不到 manifest（损坏/被删）的设备跳过，不阻塞其他设备。

### 13.4 冲突语义

**分两层：任务走字段级 3-way，其它类型仍是记录级 LWW。**

#### 13.4.1 任务：字段级 3-way（v2.3）

前提：`record_base` 里存在该记录的基线快照（= 上次同步后写出的那份），且
`base.revision < remote.revision`、两端都不是墓碑、类型是 `task`。

| 字段情况 | 结果 |
|---|---|
| 只有本地变 | 取本地 |
| 只有远端变 | 取远端（计入 `mergedFields`） |
| 两边都没变 | 取本地 |
| 两边都变且值不同 | **冲突**：取本地（revision 高的一侧），字段名进 `conflictFields` |

- 合并结果与本地不同时写回：`revision = local.revision + 1`、`updatedAt = now`，并刷新基线；
- 数组/对象字段（`contextIds`、`tags`、`checklist`、`recurrence`）按**整值**比较，不做元素级合并
  （`checklist` 元素级合并需要子项身份与删除语义，本版明确不做）；
- 相等判定用结构化深比较（`sameFieldValue`），不用 `JSON.stringify`——否则 recurrence 键顺序不同
  会被误判成"改了"，造成 revision 抖动；
- 保护性守卫（实现时被测试逼出来的）：若基线 revision ≥ 远端 revision，说明远端是**陈旧副本**，
  不做字段合并（否则会把本地新值按旧基线改回去），这类记录退回整条 LWW 并计入 `staleRemotes`。

`SyncReport` 暴露：`fieldMergedRecords` / `fieldMerges[]`（≤10 条明细）/ `mergedFields` /
`conflictFields` / `fieldMergeSkipped` / `baseSnapshotFailed`，同步页可据此显示"哪条记录的哪个字段被本机覆盖"。

#### 13.4.2 其它类型与边界

- 项目 / 分区 / 情境 / 区域 / 模板 / 附件：**记录级 LWW**（revision 优先），与 v2.0 一致。
- 任一端是墓碑 → 不做字段合并（把已删记录的字段搬进活记录等于半复活），墓碑只走 LWW 复活规则（§8.9）。
- 首次升级后第一轮同步没有基线（退化为 LWW），之后每次同步刷新基线；设备长期不同步会使基线变旧。
- 冲突可见：同步日志记录"本地胜/远端胜"清单、合并/冲突字段与耗时，More 页可查。
- 墓碑复活：见 §8.9，属预期语义。

### 13.5 凭据与加密

- 同步密码/密钥字段在桌面端经 `safeStorage` 加密后存 kv：`enc:<base64>`（DPAPI/Keychain/libsecret）；无 safeStorage 时降级 `b64:`（仅编码，不加密——会在 UI 明确提示）。
- 移动端把密码/S3 密钥写进**系统安全存储**（iOS Keychain / Android Keystore，`expo-secure-store`），kv 里只留指针 `sec:<slot>`——导出 JSON、同步日志、崩溃日志都不会带明文；安全存储不可用时降级明文并保留 UI 提示。
- **唯一取明文的地方是 `resolveSyncConfig()`**（`platform/desktop-actions.ts`）：`runManualSync` / `testSyncConnection` / `listPeerDevices` / `backupToCloud` 都经它还原。此前桌面端只在保存时加密、同步时却直接把 `enc:...` 当密码用，属于真实缺陷，v2.3 一并修掉；`openSecret` 对明文幂等，老配置无缝升级。
- 服务端只看到 manifest 与 records 的明文 JSON——**同步通道不加密**，依赖 HTTPS。若需端到端加密，应作为独立的可选层（未实现，见 §20）。

### 13.6 云备份

复用 provider 通道上传整库 JSON 快照：`gtd-backup-<timestamp>.json`。与同步的区别：备份是**时间点全量**，不做合并；恢复 = 下载 + `import.merge`（仍走 revision 决胜，不会把旧数据强行覆盖新数据）。

### 13.7 本地备份（桌面）

- `VACUUM INTO` 生成一致性快照（不停库、不锁写）；
- 每日自动 + 手动，保留最近 **7** 份（`BACKUP_KEEP`）；
- 恢复后提示重启（连接需重新打开）；
- 备份文件在 `app.getPath("userData")/backups/`，文件名带时间戳。

### 13.8 失败与恢复

| 失败 | 行为 |
|---|---|
| 网络中断 | 报告失败原因，保留本地状态，下次重试 |
| manifest 损坏 | 跳过该设备目录，日志告警，不阻塞其他设备 |
| 单批写入失败 | 事务回滚该批，已成功批次保留（可重入） |
| 磁盘空间不足 | `storage_failed`，提示清理备份 |
| 时钟偏差（S3 签名失败） | 提示校时；重试不解决时给出原始错误码 |

错误分类（`classifySyncError`，见 `platform/desktop-actions.ts`）：原始异常被翻成人能看懂的四类 +
兜底，避免把 `TypeError: fetch failed` 直接甩给用户：

| 分类 | 识别特征 | 文案 |
|---|---|---|
| 网络 | `ECONN/ETIMEDOUT/ENOTFOUND/fetch failed/timeout` | 网络不通：检查连接或网盘地址后重试 |
| 认证 | `401/403/unauthorized/forbidden/invalid_token` | 认证失败：账号或密码/令牌不对 |
| 路径 | `404/not found` | 路径不存在：检查同步目录是否已被删除 |
| 配额 | `ENOSPC/quota/space` | 空间不足：网盘配额已满 |
| 其它 | 兜底 | 同步失败：{原始 message} |

自动同步模式下失败**不打扰用户**（不弹 toast），只记录 `AutoSyncStatus.lastError` 并按 §13.3.1 退避重试。

---

## 14. 安全模型

### 14.1 威胁模型

| 威胁 | 面 | 缓解 |
|---|---|---|
| 设备丢失/被拿走 | 本地库明文 | 系统级磁盘加密（用户责任）；SQLCipher 未实现（见 §20） |
| 恶意同步服务端 | 篡改 records.json | 结构强转 + 字段级校验 + 合并规则确定性；不执行任何远端代码 |
| 恶意导入文件 | 超大 JSON / 原型污染 / 非法字段 | zod 结构校验 + `coerceTaggedRecords` 白名单字段 + 大小限制 |
| XSS（Markdown 链接） | 笔记渲染 | 仅 `http/https` 白名单，`javascript:`/`data:` 直接丢弃 |
| IPC 越权 | 渲染进程被注入 | 命令白名单 + payload 对象校验 + SELECT-only 查询 |
| 路径穿越 | 附件/同步目录 | `allowedRoots` 白名单 + `path.resolve` 前缀校验 |
| 供应链 | npm 依赖 / CI action | action 按 commit SHA 固定；依赖少量且锁定 lockfile |
| 密钥泄漏 | 签名密钥 | 只存 GitHub Secrets + 本机归档，仓库零密钥 |

### 14.2 SQL 注入

- 所有 SQL 是**静态字面量 + `?` 参数绑定**；
- 动态列/排序走白名单映射（当前无动态列）；
- 桌面 `query` 通道额外做只读校验（禁多语句/ATTACH/写 PRAGMA）；
- 由安全 hook + code review + 测试三重把守。

### 14.3 IPC 边界

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；
- preload 只暴露白名单方法，事件通道白名单校验；
- `command` 的 op 必须在 `COMMAND_OP_FLAG` 中，payload 必须是对象；
- 所有异常统一转 `AppError` 再跨进程，不泄漏堆栈细节到渲染层（开发模式除外）。

### 14.4 文件系统

- `allowedRoots` 由用户显式选择（dialog）或同步根注册；
- 读写前 `path.resolve` 后做前缀匹配，拒绝 `..` 越界；
- 附件只写应用数据目录，不写用户任意路径。

### 14.5 密钥与凭据

- Android 签名密钥：本机离线自签 RSA-4096（30 年），只存 GitHub Secrets `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD`；`apps/mobile/keys/` 全量 gitignore；
- 桌面同步密码：safeStorage OS 级加密；
- **绝对禁止**：密钥/密码写进仓库、README、commit message、issue、日志。

### 14.6 渲染安全

- 桌面生产构建禁用 DevTools 与 `webSecurity` 关闭；
- `app://` 自定义协议：静态文件命中 + SPA fallback，解析函数拒绝目录穿越；
- 不加载任何远程脚本/字体/CDN（离线可用）。

### 14.7 供应链

- GitHub Actions 全部按 commit SHA 固定（防 tag 劫持）；
- Actions 零制品存储（构建产物直发 Release），避免配额耗尽型 DoS；
- 依赖数量克制（core 仅 zod + zustand；ui 仅 RN 生态）。

### 14.8 隐私

- 零遥测、零崩溃上报、零第三方 SDK；
- 唯一网络行为：用户显式配置的同步/云备份 + 可选更新检查；
- 导出/备份文件由用户自行保管。

---

## 15. 测试策略

### 15.1 测试金字塔

```
        ┌──────────────┐
        │  截图巡检     │  离屏渲染真实页面（白屏/溢出/暗色）
        ├──────────────┤
        │  冒烟 E2E    │  Electron --smoke：命令链路/菜单/托盘/同步双设备
        ├──────────────┤
        │  类型检查     │  四包 tsc --noEmit（strict）
        ├──────────────┤
        │  单元测试     │  纯函数：解析/重复/筛选/合并/统计/导出/对比度/a11y
        └──────────────┘
```

### 15.2 测试地图

| 文件 | 覆盖 | 数量级 |
|---|---|---|
| `core/__tests__/doc-conformance.test.ts` | 技术文档语法表 / 重复语义 / 筛选逐条符合性 | 33 |
| `core/__tests__/quick-add.test.ts` | 28+ 语法、边界、中英混排 | 30+ |
| `core/__tests__/p0-features.test.ts` / `p1-features.test.ts` | defer / 即将 / 提醒 / 回顾统计 / 标签 / 区域 | 40+ |
| `core/__tests__/filters.test.ts` | 搜索/情境/标签/逾期组合 | 10+ |
| `core/__tests__/adopted-optimizations.test.ts` | 批量规划 / 解析器语义修正回归 | 10+ |
| `core/__tests__/ipc-serializable.test.ts` | 全部命令 payload 的 `structuredClone` 往返 | 20+ |
| `core/__tests__/kanban-dnd.test.ts` | 看板命中判定（边界/空隙/同列） | 7 |
| `core/__tests__/v2-search-clarify.test.ts` | 搜索排序 / snippet / 理清决策树 / 进度 | 25+ |
| `core/__tests__/v2-stats-matrix.test.ts` | 统计窗口 / streak / 四象限边界 | 20+ |
| `core/__tests__/v2-exporters-errors.test.ts` | Markdown 转义 / ICS 折行 / JSON 稳定 / AppError | 25+ |
| `ui/__tests__/contrast.test.ts` | WCAG 对比度（亮暗各一套 + 计算器自检） | 20+ |
| `ui/__tests__/a11y-audit.test.ts` | 图标按钮 label / 禁止直用 `<Text>` / 可点元素 role | 10+ |
| `ui/__tests__/v2-tokens.test.ts` | alpha / 新色对比 / 字号阶梯单调性 | 29 |
| `ui/__tests__/v2-undo-shortcuts.test.ts` | 撤销栈容量/LIFO/TTL、快捷键匹配与输入框豁免 | 13 |
| `core/__tests__/v2-importers.test.ts` | Markdown/Todoist/TickTick/通用 CSV 解析、日期校验 | 18 |
| `core/__tests__/v2-templates.test.ts` | 模板 upsert/instantiate/softDelete、迁移 v5、checklist 重生成 id | 15 |
| `ui/__tests__/fuzzy.test.ts` | 命令面板打分 | 3 |
| `desktop/tests/commands.test.ts` | 真实 SQLite 命令层（回收站/墓碑/重复推进） | 20+ |
| `desktop/tests/sync.test.ts` | 双设备合并 / 冲突 / 墓碑 | 15+ |
| `desktop/tests/sigv4.test.ts` | S3 签名向量 | 5+ |

**当前总量**：`bun test packages/core packages/ui apps/desktop/tests` → **291 项全绿 / 22 个文件 / 961 条断言**（v1 基线 177，v2 新增 114）。

### 15.3 质量门（每次改动都要过）

```powershell
# 1) 类型
cd packages/core; bunx tsc --noEmit
cd packages/ui;   bunx tsc --noEmit
cd apps/mobile;   bunx tsc --noEmit
cd apps/desktop;  bunx tsc --noEmit

# 2) 单元测试
cd E:\gtd清单; bun test packages/core packages/ui apps/desktop/tests

# 3) web 导出（桌面渲染层来源）
bun run export:web

# 4) 桌面冒烟（8 组断言）
bun run smoke:desktop

# 5) 截图巡检（smoke 覆盖不到的路由）
cd apps/desktop; bunx electron . "--shot=375x812,out.png,/"
#   支持 ?dark=1&fontScale=2
```

**截图巡检必须做**：React #185 白屏就是靠它发现的（smoke 只覆盖关键路径）。

> ⚠️ **无 GUI 环境（CI 容器 / 远程沙箱）**：Electron 需要创建窗口与 Mojo IPC；在禁止命名管道的环境会以 `platform_channel.cc Check failed: 拒绝访问` 崩溃，`--smoke`/`--shot` 无法执行。此时降级验证为：`bun run build:desktop`（esbuild 打包）+ 桌面主进程 headless harness（假 electron + 真 @gtd/core/SQLite，覆盖 22 个 IPC 通道、协议注册顺序、菜单语言切换、备份），并在有桌面会话的机器上补跑 smoke 与截图。**不要把"没跑"写成"通过"。**

### 15.4 测试纪律

- **时间可注入**：所有业务函数接受 `now` 参数，测试不 mock `Date.now`；
- **不 mock 数据库**：命令层直接在真实 SQLite（内存库）上跑；
- **文档锁**：改 `quick-add.ts` / `recurrence.ts` / `selectors.ts` 必须先跑 `doc-conformance`——文档表格与实现互为契约；
- **回归优先**：修 bug 先写失败用例，再修；
- **不削弱断言**：为了让测试通过而放宽断言属于评审否决项。

---

## 16. 构建与发布

### 16.1 版本号规则

| 位置 | 字段 |
|---|---|
| `apps/mobile/package.json` | `version` |
| `apps/mobile/app.json` | `expo.version` **和** `expo.android.versionCode`（两层都要写！） |
| `apps/desktop/package.json` | `version` |

只写 root `version` 会让 APK `versionName` 停在旧版（v0.12.0 踩过，CI 现有守卫会红）。版本号修改必须用 JSON 解析式脚本，禁用 `sed`。

### 16.2 CI 产物矩阵

| 平台 | 产物 | 说明 |
|---|---|---|
| Android | 4 个 APK（arm64-v8a / armeabi-v7a / x86_64 / universal） | CI 注入 ABI splits；签名密钥从 Secrets 还原；apksigner 逐包验签 |
| Windows | NSIS x64 + arm64（合一安装器） | electron-builder |
| macOS | dmg x64 + arm64 | 未签名（右键→打开）；`needs` 串行防 422 |
| Linux | AppImage x64 + arm64 | electron-builder |
| iOS | 未签名 IPA + 模拟器 zip | `CODE_SIGNING_ALLOWED=NO`，无 Apple 账号侧载方案 |

构建时长参考：Android ~35–40 min，其余 2–10 min；macOS 依赖 win+linux 串行。

### 16.3 发布 SOP

```
① 版本 bump（JSON 解析式，三层字段）
② 本地质量门（§15.3）
③ Git Data API 推提交（blob → tree → commit → PATCH refs）
④ 打 annotated tag（POST git/tags + git/refs）→ 触发 release workflow
⑤ 等 CI 五 job 全绿
⑥ 核对 release 资产时间戳全部来自本次 run
⑦ PATCH draft=false + 写 release notes（中文，含下载表）
⑧ 下载 APK 校验（curl 断点续传 + zipfile 全量 testzip）
```

**发布铁律**：
- 重打标签前必须删草稿 + 删标签（取消的 run 会把旧资产留在草稿里造成污染）；
- 杀干净所有 curl 后只保留一条下载命令（两条并发写同一文件会互相追加损坏）；
- 校验以 `zf.testzip()` 为准，不看文件大小；
- workflow 修改需要 `workflow` scope；大 JSON body 一律 `gh api --input` 临时文件。

### 16.4 回滚

资产/构建出错 → 删除该 release 全部资产 → 修 workflow → `gh workflow run release.yml --ref main`（workflow_dispatch）重跑。release 上传步骤已内置 TAG 推导（`GITHUB_REF_NAME=main` 时从 `app.json expo.version` 推 `v<version>`）。

---

## 17. 性能预算与观测

### 17.1 预算（超出即视为回归）

| 指标 | 预算 | 测量方式 |
|---|---|---|
| 冷启动到可交互 | 桌面 ≤1.5s / 移动 ≤2.5s | 手动打点（`performance.now` 写 console） |
| 命令往返（桌面 IPC） | ≤8ms（P95，1k 任务库） | `--smoke` 内计时 |
| 列表滚动 | 60fps（1k 行） | DevTools Performance |
| 搜索（1 万任务） | ≤50ms | `console.time` 包裹 `searchAll` |
| bootstrap（1 万任务） | ≤300ms | 同上 |
| 主 JS bundle（web 导出） | ≤3.5MB gzip 前 | 构建产物大小 |
| 内存（1 万任务） | ≤250MB（桌面渲染进程） | 任务管理器 |

**v2.0 构建实测**（本机，无 GUI 环境）：
- web 入口 bundle `entry-*.js` **2.7MB**（预算 3.5MB，符合）；
- 全量单测 291 项 **<1s**（`bun test`，含真实 SQLite 用例）；
- 四包 `tsc --noEmit` 单次全绿（无增量缓存）；
- Electron 主进程打包产物 1.5MB（esbuild，external electron/better-sqlite3）。

### 17.2 已知性能约束

- **全量内存模型**：bootstrap 载入全部记录，筛选/搜索是纯 JS。按模型估算 1 万任务量级可接受（v2 未做大库基准测试，需在真实库上补测）；10 万级需要分页或 SQL 侧查询。
- **大列表**：`TaskList` 已用 `FlatList` 虚拟化（`initialNumToRender 14` / `windowSize 9` / Android `removeClippedSubviews`），但行高不固定（标题最多两行）故未设 `getItemLayout`；万级数据仍建议引入分页或按项目分组加载。
- **同步全量扫描**：manifest 从全表构建，大库同步耗时随记录数线性增长。
- **桌面 IPC 返回完整记录**：批量操作返回的记录数组可能较大（1000 条批量完成 ≈ 数百 KB），仍在可接受范围。

### 17.3 观测手段（无遥测）

- 开发模式：`console.time`/`performance.mark` 打点，不写入代码库的常驻埋点；
- 生产：不采集任何数据；用户可通过"关于 → 诊断"复制版本/库大小/设备信息（手动）；
- 同步日志：`kv["sync.log"]` 记录条数与耗时，UI 可查。

---

## 18. 目录结构与模块边界

```
packages/core/src
├─ models/
│  ├─ base.ts                 BaseRecord
│  ├─ task.ts                 Task / Project / Section / Context / Area / Attachment / RecurrenceRule
│  ├─ commands.ts             CommandMap + 全部 payload zod schema（唯一契约）
│  └─ errors.ts               AppError / AppErrorCode / toAppError
├─ db/
│  ├─ ids.ts                  uuidv7
│  ├─ migrations.ts           版本化迁移（v1–v4）
│  ├─ queries.ts              bootstrap 与常规查询
│  ├─ mappers.ts              行 ↔ 实体双向映射
│  ├─ coerce.ts               不可信记录强转
│  └─ commands/
│     ├─ index.ts             注册表 + executeCommand（唯一入口）
│     ├─ shared.ts            事务/行读写/排序键等公共能力
│     ├─ task.ts              8 个任务命令
│     ├─ project.ts           项目命令
│     ├─ section.ts / contexts.ts / areas.ts / attachments.ts / settings.ts / sync.ts
│     └─ templates.ts          模板 upsert/softDelete/instantiate ← v2
├─ features/
│  ├─ quick-add.ts            自然语言解析
│  ├─ recurrence.ts           重复规则推进
│  ├─ tags.ts                 标签归一化
│  ├─ due-scan.ts             通知扫描
│  ├─ review.ts               每周回顾汇总
│  ├─ kanban-dnd.ts           看板拖拽命中（纯函数）
│  ├─ bulk-ops.ts             批量操作规划
│  ├─ tombstones.ts           墓碑压缩
│  ├─ search.ts               全局搜索排序        ← v2
│  ├─ clarify.ts              理清决策树          ← v2
│  ├─ stats.ts                统计口径            ← v2
│  ├─ matrix.ts               四象限              ← v2
│  ├─ exporters.ts            Markdown/ICS/JSON   ← v2
│  └─ importers.ts            Markdown/Todoist 解析 ← v2
├─ sync/
│  ├─ types.ts                Manifest / SyncConfig / 预设
│  ├─ providers.ts            WebDAV / HTTP / Folder
│  ├─ s3.ts                   SigV4
│  ├─ merge.ts                合并决胜
│  └─ service.ts              同步编排
├─ store/
│  ├─ app-store.ts            zustand vanilla + runCommand + quickAdd
│  └─ selectors/
│     ├─ index.ts             barrel（selectors.ts 转发）
│     ├─ time.ts              时间边界 / 排序 / defer
│     ├─ tasks.ts             各视图派生
│     ├─ projects.ts          区域分组
│     └─ filters.ts           筛选 / 标签 / 搜索
├─ platform/
│  ├─ executor.ts             SqliteExecutor 契约
│  ├─ ports.ts                端口单例（Notifications/Files/Share/DeepLink）
│  └─ ipc-executor.ts         桌面 IPC executor
└─ index.ts                   公开 API barrel

packages/ui/src
├─ theme/       tokens / AppText / primitives / feedback(Toast)
├─ components/  AppShell / Screen / TaskRow / TaskList / … / Sheet / SegmentedControl
├─ hooks/       useTheme / useAppStore / useBreakpoint / useFocusStyle / useReducedMotion
├─ i18n/        zh/en 双词典 + 插值
├─ lib/         fuzzy（命令面板打分）/ shortcuts（快捷键匹配）/ undo-stack（撤销栈）
└─ platform/    useKeyboardShortcuts(.web/.native)

apps/mobile/src
├─ app/         Expo Router 路由（见 §12.1）
├─ platform/    bootstrap / desktop-actions / mobile-actions / export-actions /
│               CommandPaletteHost / palette-store / font-scale / font-loader / seed
├─ hooks/       useListInteractions / usePerspectives / useRowActions
└─ lib/         task-ops / context-menu / gtd-api / health

apps/desktop/src
├─ main/        main / state / ipc / window / menu / backup / updater / smoke
└─ preload/     preload.ts（类型化 window.gtd）
```

**模块边界规则**：
1. `features/*` 不 import `db/*`（纯函数，只吃 model 与 state）；
2. `db/commands/*` 可以 import `features/*`（重复推进、合并决胜），反向禁止；
3. `store/*` 只 import `db` 的入口与 `features`，不 import React；
4. `ui/components/*` 不直接 import `@gtd/core` 的 db 层，只用 store/selectors/features；
5. 壳层（`apps/*`）不实现业务规则，只做端口与页面编排。

---

## 19. v1 → v2 迁移指南

### 19.1 数据兼容

| 项 | 结论 |
|---|---|
| 数据库文件 | **直接兼容**：表名/列名不变，v4 只加索引并回填空 `order_key` |
| 同步目录 | **直接兼容**：manifest/records 格式未变 |
| 备份 JSON | **直接兼容**：`import.merge` 路径未变 |
| 回滚 | v4 变更对旧版本无害（索引可忽略、order_key 回填是修正），可用 v1 直接打开 v2 的库；但旧版本写入的新记录不会带 v4 索引优化 |

### 19.2 Core API 变化

| 变化 | 影响 | 处理 |
|---|---|---|
| `db/commands.ts` 拆为 `db/commands/*` | import 路径不变（转发文件保留） | 无需改动 |
| `store/selectors.ts` 拆为 `store/selectors/*` | 同上 | 无需改动 |
| 新增 `AppError` | `executeCommand` 现在抛 `AppError` 而非原始 Error | 捕获处可按 `code` 分支；`err.message` 仍可读 |
| 新增 `searchAll/computeStats/groupByQuadrant/clarifyOptions/toMarkdown/toICS/toBackupJSON` | 纯增量 | 直接用 |
| `sync/merge.ts` 决胜补 id 兜底 | 行为更确定 | 无需改动 |

### 19.3 UI 变化

| 变化 | 兼容性 |
|---|---|
| 色板换为「纸与墨」（canvas/surface/primary 等值变化） | token 键名不变，组件无需改；视觉需重新验收 |
| 字号阶梯调整（title 18→20、body 行高 22→24） | 固定高度容器需检查是否够高（截图巡检） |
| `Card` 默认 `outline`（无阴影） | 传 `variant="raised"` 可恢复浮起感 |
| 新增 `AppShell / Sheet / SegmentedControl / StatTile / Highlight / Toast` | 纯增量 |
| 新增路由 `/process` `/search` `/insights` `/matrix` | 纯增量 |

### 19.4 升级步骤（用户视角）

1. 升级前先做一次本地备份（桌面：备份按钮；移动：导出 JSON）；
2. 安装新版本（Android 若跨签名链需卸载重装，见 §16）；
3. 首次启动自动跑 v4 迁移（毫秒级）；
4. 验证：收集箱/今天/项目/回顾各打开一次，确认数据与视图一致；
5. 若异常：用备份恢复（桌面 `backup.restore`；移动导入 JSON）。

### 19.5 升级步骤（开发者视角）

```powershell
bun install                                  # bunfig.toml 必须已存在
bun test packages/core packages/ui apps/desktop/tests
bun run export:web
bun run smoke:desktop
# 四包 tsc + 截图巡检（§15.3）
```

---

## 20. 路线图与已知限制

### 20.1 已知限制（如实记录）

| 项 | 现状 | 影响 |
|---|---|---|
| iOS 真机 | 所有构建未在真机验证（无 Apple 账号/设备） | 侧载可用性未知 |
| macOS 公证 | dmg 未签名/未公证 | 首次打开需右键→打开 |
| Windows arm64 / Linux arm64 | CI 已产出，未实机验证 | 可能存在平台特有问题 |
| 数据库加密 | 未启用 SQLCipher | 设备丢失时数据可被读取（依赖系统磁盘加密） |
| 大列表性能 | FlatList 已虚拟化；未做 getItemLayout/分页 | 万级数据滚动略抖 |
| 同步加密 | 通道明文（依赖 HTTPS） | 恶意服务端可读内容 |
| 字段级合并 | 未做（记录级 LWW） | 同任务并发编辑会丢字段 |
| 日历/时间块 | 未做 | 无时间块规划 |
| 导入器 | 支持 JSON、Markdown 清单、Todoist CSV；无 TickTick/通用 CSV 列映射 | 其他工具迁移仍需手工整理 |
| 看板列内排序 | 未做（仅跨列改状态） | 列内顺序需回列表视图调 |
| 自动更新 | 配置就绪，未实测 | 桌面更新依赖手动下载 |
| 模板墓碑 | 已进同步，但未纳入 90 天物理压缩清单 | 长期使用后 `task_templates` 墓碑会累积（体量极小） |

### 20.2 下一阶段优先级

**P1（体验闭环）—— 已在 v2 完成**
1. ✅ 列表虚拟化：`TaskList` 使用 `FlatList`（14/9 窗口参数、Android 裁剪）；
2. ✅ 撤销栈：10 层有界栈 + `Ctrl+Z` + 60 秒 TTL；
3. ✅ 任务模板：`task_templates`（schema v5）+ 三个命令 + 模板页 / 详情页另存；
4. ✅ 导入器：Markdown / Todoist / TickTick / 通用 CSV 列映射；
5. ✅ 撤销历史面板：提示条上的「还可撤销 N 步」打开，可单步或全部回滚。

**P2（能力扩展）**
1. 时间块 / 日历同步（ICS 双向）；
2. 艾森豪威尔矩阵的拖拽改优先级；
3. 统计面板导出（PNG/CSV）；
4. 多设备冲突可视化合并（字段级 diff）。

**P3（平台深化）**
1. SQLCipher 全库加密（需评估 expo-sqlite 支持）；
2. 同步端到端加密（客户端加密 records，服务端只见密文）；
3. iOS 真机签名与 TestFlight；
4. macOS 公证 + 自动更新实测。

### 20.3 不做清单（保持克制）

- 多人协作 / 共享清单 / 评论；
- 官方云服务与账号体系；
- AI 自动排期（解析器保持确定性规则）；
- 遥测与用户行为分析。

---

## 21. 附录

### 21.1 术语表

| 术语 | 含义 |
|---|---|
| **捕获 / Capture** | 把想法快速记入收集箱，不做判断 |
| **理清 / Clarify** | 逐条判断：可行动？下一步？2 分钟？委派？将来也许？ |
| **组织 / Organize** | 归入项目/区域/情境/标签，确定下一步行动 |
| **回顾 / Review** | 每周六步向导，校准系统可信度 |
| **执行 / Engage** | 今天/专注/矩阵视图选择当下要做的事 |
| **下一步行动** | 项目里第一个具体可执行的动作（顺序项目取首个未完成） |
| **情境 / Context** | 完成该动作所需的条件（@电脑 / @电话 / @外出） |
| **区域 / Area** | 长期责任领域（工作 / 生活 / 学习），项目的上层归类 |
| **defer** | 开始日期：到点前不出现，避免过早干扰 |
| **墓碑 / Tombstone** | 软删除记录，参与同步以传播删除 |
| **Perspective** | 保存的筛选组合（关键词+情境+标签+逾期） |
| **Manifest** | 同步用的 `id → {revision, updatedAt, deletedAt}` 索引 |

### 21.2 命令速查

```
task.create / task.update / task.moveStatus / task.reorder
task.complete / task.uncomplete / task.softDelete / task.restore
project.upsert / project.softDelete / project.markReviewed
section.create
context.upsert
area.upsert / area.softDelete
attachment.add / attachment.remove
settings.set
sync.applyRemote / import.merge
```

### 21.3 i18n 规范

- 键名：`域.对象.属性`（如 `task.a11yMarkComplete`、`clarify.reason.twoMinute`）；
- 插值：`{name}` 占位，`t(key, params)`；
- 新增文案必须同时补 zh 与 en，缺一由测试/评审拦截；
- 领域层（core）只返回**键名或 reasonCode**，不返回面向用户的句子。

### 21.4 v2 变更日志（相对 v1.0 文档）

| 类别 | 变更 |
|---|---|
| 架构 | `db/commands.ts`（749 行）→ 8 个领域模块 + 显式注册表；`store/selectors.ts` → 4 个模块；Electron `main.ts`（1049 行）→ 8 个模块 |
| 类型 | 新增 `AppError`/`AppErrorCode`，命令错误可编程处理 |
| 数据 | v4 迁移（索引加固 + `order_key` 回填）；v5 迁移（`task_templates` 表） |
| 功能 | 新增理清向导、全局搜索、统计面板、四象限矩阵、Markdown/ICS 导出、Markdown/Todoist/TickTick/通用 CSV 导入、任务模板 |
| 交互 | 撤销从"最近一次"升级为 10 层有界栈（Ctrl+Z 逐层回退 + 历史面板）；快捷键在输入框内默认让位 |
| UI | 设计语言 v2「纸与墨」；新增 AppShell/Sheet/SegmentedControl/StatTile/Highlight/Toast/Skeleton/Badge/ProgressBar/Tag；字号与色板升级 |
| 文档 | 本文重写为单一可信来源（21 章） |
| 测试 | 177 → 291（新增 v2 特征、迁移/合并、token/对比度用例） |

### 21.4.1 v2.2 增量（相对 v2.0.0）

| 类别 | 变更 |
|---|---|
| 首启 | 新增三屏引导（记 → 理清 → 今天）+ 示例任务；`kv["onboarding.done"]` 门控，已有任务的老用户静默补标记不打扰 |
| 收集箱 | 首屏 5 层控件 → 2 层（快速添加 + 搜索/漏斗）；保存的筛选移入漏斗弹层（`FilterBar.sheetExtra`）；移除收集箱看板视图 |
| 空态 | `EmptyState.suggestions`：四个可点击语法片段（`@电脑` `#工作` `!!! 明天` `> 张三`）直接填进快速添加 |
| 更多页 | 8 组 22 项 → 首屏 10 项；拆出 `/settings`（主题/字体/语言/关于）与 `/data`（导出/导入/备份）；同步块默认折叠 |
| 今天 | 手机端收敛为 列表/即将，日历进「更多视图」菜单；桌面端仍四视图 |
| 批量 | 新增批量推迟（今天/明天/下周一 18:00）；批量栏改为 完成/移动/推迟/删除；撤销回到各自原 `dueAt`（新增 `deferTargetTime`/`planBulkDefer`） |
| 撤销 | 新增 `/recent` 最近操作页：撤销栈可视化 + 撤销上一步 + 全部撤销 |
| 导出 | 移动端可选「保存到手机文件夹」（Android SAF，写入用户选定目录）或「分享给其他应用」；提示改为文件名；删除重复实现 `platform/mobile-actions.ts` |
| 清理 | 删除未接线的 `Fab`、`TwoPaneLayout` 组件 |
| 测试 | 291 → 299（新增 `deferTargetTime` 5 例 + `planBulkDefer` 3 例） |

### 21.4.2 v2.3 增量（同步专项）

| 类别 | 变更 |
|---|---|
| 自动同步 | 新增 `sync/auto.ts` 纯逻辑调度器（防抖 20s / 最小间隔 60s / 失败退避 5min×n 上限 30min / 并发保护），启动、回前台、本地改动三处触发；开关 `kv["sync.auto"]` |
| 进度 | `syncNow({onProgress})` 回调 manifest/pull/apply/push 四阶段 `done/total`；`SyncReport` 增 `durationMs`、`conflictSamples` |
| 设备可见 | `sync/devices.ts#describePeerDevices`：对方设备短 id、记录数、最后活动时间（从 manifest 推导，不新增文件格式） |
| 凭据 | 移动端密码/S3 密钥进系统安全存储（`expo-secure-store`），kv 只留 `sec:` 指针；新增 `resolveSyncConfig()` 作为**唯一**取明文入口——顺带修掉"桌面端保存时加密、同步时却把 `enc:...` 当密码用"的缺陷 |
| 错误 | `classifySyncError()` 把异常分五类（网络/认证/路径/配额/其它）给成人话；自动同步失败不打扰用户，按退避重试 |
| 合并 | 任务升级为**字段级 3-way**（`record_base` 基线 + `sync/fieldmerge.ts` 纯函数），其它类型仍记录级 LWW；冲突字段名进 `SyncReport.conflictFields` |
| 迁移 / 测试 | 新增 v6 迁移（`record_base`）+ 原生依赖 `expo-secure-store`；测试 291 → 337（+13 字段合并、+5 设备列表、+7 调度、+13 加密向量） |
| 移动端运行时 | 新增 `sync/crypto.ts`（纯 JS SHA-256 / HMAC-SHA256 / UTF-8 / Base64）：Hermes 没有 `btoa`、`TextEncoder`、`crypto.subtle`，此前**手机端 WebDAV 认证与 S3 签名必崩**；改后全仓不再依赖这些运行时全局（NIST / RFC 向量 13 例兜底） |

> ⚠️ 破坏性提醒：`expo-secure-store` 是原生模块，**必须重新构建安装包**才会生效；2.2.0 及更早的 APK 装上后手机端同步仍会失败。

### 21.5 v2 交付指标

| 指标 | v1（重构前） | v2（重构后） |
|---|---|---|
| core 代码量 | 5,180 行 / 36 文件 | 8,788 行 / 65 文件 |
| ui 代码量 | 7,371 行 / 51 文件 | 9,801 行 / 62 文件 |
| mobile 代码量 | 3,265 行 / 30 文件 | 5,956 行 / 37 文件 |
| desktop 代码量 | 1,736 行 / 6 文件 | 1,891 行 / 13 文件 |
| 最大单文件 | `db/commands.ts` 749 行；`main.ts` 1,049 行 | 命令层最大 220 行；`main.ts` 74 行 |
| 测试 | 177 项 / 14 文件 | 291 项 / 22 文件 |
| 技术文档 | 407 行（v0.11） | 1,693 行（v2.0，21 章） |

> 代码量增加来自新增能力（理清/搜索/统计/矩阵/导出）与拆分后的模块头注释；单文件复杂度显著下降（最大命令模块 220 行，入口 74 行）。

---

*文档版本：v2.0 · 最后更新：2026-11-02 · 维护者：项目 owner*

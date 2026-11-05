# 功能全集与实现说明

> 定位：**按功能看实现**。每个功能写清「用户看到什么 → 代码怎么做到 → 关键取舍」。
> 与其它文档的关系：
> - 架构/数据模型/命令规范 → `technical-reference.md`
> - 导入导出格式细节 → `import-export-formats.md`
> - 同步专项 → `sync-overview.md`
> - 用户视角怎么用 → `user-feature-guide.md`
>
> 对应版本：v2.3.0

---

## 0. 一屏看懂架构

```
┌──────────────────────────────────────────────────────────────┐
│ apps/mobile  (Expo Router，同时是桌面渲染层)                  │
│   24 个路由 / 24 个页面 · 平台适配层 platform/*.ts            │
├──────────────────────────────────────────────────────────────┤
│ packages/ui  (React Native + react-native-web，39 个组件)      │
│   设计系统 tokens / 原语 / 业务组件 / i18n / 反馈宿主          │
├──────────────────────────────────────────────────────────────┤
│ packages/core (纯 TypeScript：无 React、无 DOM、无平台 API)    │
│   models · db(命令/查询/迁移) · features(纯算法) · sync · store│
├──────────────────────────────────────────────────────────────┤
│ apps/desktop (Electron 主进程，零业务逻辑)                     │
│  窗口/托盘/菜单/全局快捷键/IPC 白名单/备份/更新/冒烟           │
└──────────────────────────────────────────────────────────────┘
```

**唯一的写入路径**：UI → `runCommand(op, payload)` → zod 校验 → `immediate` 事务 → `CommandResult{ids, records, serverTime}` → `applyRecords` 写 store。
**唯一的读取路径**：`appStore` 快照 → `store/selectors/*` 纯函数派生。
**core 里没有平台 API**：平台差异全部收在 `apps/mobile/src/platform/*` 与注入的端口（`FilesPort`/`CommandPort`/`NotificationsPort`）。

当前规模：命令 **23 个**、路由 **24 个文件（22 个页面 + 2 个布局）**、UI 组件 **39 个**、core 纯算法模块 **14 个**、测试 **337 条 / 27 个文件**。

---

## 1. 功能总表

| # | 功能 | 入口 | 实现位置（关键函数） |
|---|---|---|---|
| 1 | 快速添加（自然语言） | 收集箱顶部输入框 | `features/quick-add.ts#parseQuickAdd` |
| 2 | 添加预览（解析结果回显） | 输入框下方 | 同上，页面 `(tabs)/index.tsx` 组装 `preview` |
| 3 | 语法速查弹层 | 输入框「?」 | `ui/QuickAddBar.tsx#QuickAddHelpSheet` |
| 4 | 命令面板 `Ctrl+K` | 桌面快捷键 / tab 内 | `ui/CommandPalette.tsx` + `platform/CommandPaletteHost.tsx` |
| 5 | 全局快速收集 `Ctrl+Shift+Space` | 系统级快捷键 | `desktop/main/main.ts#globalShortcut` → IPC → 新建任务 |
| 6 | 深链 `gtd://add?title=` | 系统/网页 | `expo-linking` + `app/add.tsx` |
| 7 | 理清向导 | 收集箱「理清」 | `features/clarify.ts` + `app/process.tsx` |
| 8 | 项目（顺序/并行、下一步、进度） | 项目 tab | `models/task.ts`、`ui/ProjectCard.tsx`、`(tabs)/projects.tsx` |
| 9 | 区域分组 | 项目页 | `area.upsert` + 分组建树 |
| 10 | 项目内分区（section） | 项目详情 | `section.create`、`db/commands/section.ts` |
| 11 | 情境（@在哪做） | 任务详情 / 筛选 | `context.upsert`、`ui/Chip.tsx` |
| 12 | 标签（+多维检索） | 任务详情 / 快速添加 | `features/tags.ts#normalizeTags` |
| 13 | 保存的筛选（视角） | 收集箱漏斗弹层 | `ui/PerspectiveBar.tsx` + `hooks/usePerspectives` |
| 14 | 今天（列表/即将/日历/时间线） | 今天 tab | `store/selectors/tasks.ts#getTodayTasks` + `ui/{UpcomingView,CalendarView,TimelineView}` |
| 15 | 专注（选入专注 + 番茄钟） | 专注 tab | `ui/Pomodoro.tsx`（25 分钟）+ `starred` 字段 |
| 16 | 任务详情（全字段编辑） | 点任务行 | `ui/TaskDetailContent.tsx`、`task.update` |
| 17 | 清单子项（checklist） | 详情页 | `ui/ChecklistEditor.tsx`、`task.update{checklist}` |
| 18 | 附件（仅元数据登记） | 详情页 | `attachment.add/remove`、`ui/AttachmentList.tsx` |
| 19 | 重复任务（6 种频率） | 详情页 | `features/recurrence.ts#nextOccurrence` |
| 20 | 完成任务 / 取消完成 | 勾选、左滑 | `task.complete` / `task.uncomplete` |
| 21 | 右滑延后到明天 9:00 | 列表手势 | `features/bulk-ops.ts#planDeferToTomorrow` |
| 22 | 多选批量：完成/移动/推迟/删除 | 长按进入多选 | `ui/BulkActionBar.tsx`、`hooks/useListInteractions.ts`、`features/bulk-ops.ts` |
| 23 | 拖拽排序 | 页头「排序」按钮 | `task.reorder` + `orderKey`（分数索引） |
| 24 | 看板视图（项目详情） | 视图切换 | `ui/KanbanBoard.tsx`、`features/kanban-dnd.ts` |
| 25 | 撤销（10 步 / 60 秒） | 底部提示条 / `Ctrl+Z` | `ui/lib/undo-stack.ts`、`ui/UndoBar.tsx#showUndo` |
| 26 | 最近操作（撤销栈可视化） | 更多 → 清理 | `app/recent.tsx`（`listUndo/undoLast/undoAll`） |
| 27 | 已完成列表 | 更多 → 清理 | `app/completed.tsx` |
| 28 | 回收站（恢复软删） | 更多 → 清理 | `task.restore`、`app/trash.tsx` |
| 29 | 墓碑压缩（90 天自动） | 无感知 | `features/tombstones.ts#maybeCompactTombstones` |
| 30 | 每周回顾（六步向导） | 更多 → 今日回顾 | `features/review.ts#buildReviewSummary`、`ui/ReviewWizard.tsx` |
| 31 | 统计面板 | 更多 → 洞察 | `features/stats.ts#computeStats` |
| 32 | 四象限 | 更多 → 洞察 | `features/matrix.ts#groupByQuadrant` |
| 33 | 全局搜索 | 更多 → 洞察 / 搜索页 | `features/search.ts#searchAll`、`ui/Highlight.tsx` |
| 34 | 任务模板（另存/新建/实例化/删除） | 详情页 / 更多 → 洞察 | `models/task.ts#TaskTemplate`、`template.*` 命令 |
| 35 | 导出（JSON/Markdown/ICS） | 更多 → 数据 | `features/exporters.ts`、`platform/export-actions.ts` |
| 36 | 导入（Markdown/Todoist/TickTick/CSV） | 更多 → 数据 | `features/importers.ts`、`app/import.tsx` |
| 37 | 备份（本地 7 份 / 云备份） | 更多 → 数据 | `desktop/main/backup.ts`、`providers.ts#CloudBackupPort` |
| 38 | 同步（WebDAV/HTTP/S3/文件夹） | 更多 → 同步 | `sync/service.ts#syncNow`（详见 `sync-overview.md`） |
| 39 | 自动同步 | 默认开启 | `sync/auto.ts` + `platform/sync-scheduler.ts` |
| 40 | 通知（每日概览 + 时刻提醒） | 系统通知 | `features/due-scan.ts`、`platform/bootstrap.ts` |
| 41 | 首启引导（三屏 + 示例任务） | 首次打开 | `ui/Onboarding.tsx`、`app/onboarding.tsx`、`kv["onboarding.done"]` |
| 42 | 主题（跟随系统/浅/深） | 更多 → 设置 | `ui/theme/tokens.ts`、`kv["theme.mode"]` |
| 43 | 字体（系统 / 霞鹜文楷懒加载） | 更多 → 设置 | `platform/font-loader.ts` |
| 44 | 语言（中/英） | 更多 → 设置 | `packages/ui/src/i18n`（550+ 键） |
| 45 | 大字体防御 | 无感知 | `platform/font-scale.ts` + `AppText` 锁缩放 + CI 注入 |
| 46 | 桌面：托盘 / 菜单 / 关闭最小化 | 系统 | `desktop/main/{window,menu}.ts` |
| 47 | 桌面：原生右键菜单 | 任务行右键 | `desktop/main/ipc.ts#contextMenu` |
| 48 | 桌面：自动更新 | 启动检查 | `desktop/main/updater.ts` |

---

## 2. 捕获（Capture）

### 2.1 快速添加：一句话解析成结构化任务

**用户看到**：输入「给张总发周报 #工作 @电脑 !! 明天 下午3点 +本周」，下方立刻回显「→ 给张总发周报 · P2 · 11/6 · #工作 · @电脑 · +本周」。

**实现**：`features/quick-add.ts#parseQuickAdd(input, now)` 是一个纯函数，用**一组正则**从同一行文本里抽字段，谁先命中谁生效，抽走的部分从标题里删掉：

| 目标 | 语法 | 产出字段 |
|---|---|---|
| 情境 | `@name`（多个） | `contextNames[]` |
| 项目 | `#name` | `projectName` |
| 标签 | `+name`（多个） | `tags[]`（`normalizeTags` 归一：去重、去空白） |
| 优先级 | `!`/`!!`/`!!!` | `priority` 1/2/3 |
| 等待 | `>某人` | `waitingFor` + `suggestsWaiting` |
| 日期 | `今天/明天/后天/周五/下周一/3天后/10月1日/2026-11-05` | `dueAt`（只写日期 → **18:00**） |
| 时刻 | `下午3点/15:30/3pm/晚上8点` | 覆盖 `dueAt` 的时分 |
| 重复 | `每天/每工作日/每周一三/双周/每月15日/每月最后工作日/每年10月1日/每隔3天/完成后3天/重复5次` | `recurrence` |

**取舍**：确定性规则、不接 AI。好处是可预测、可测（`__tests__/quick-add.test.ts` 153 行），坏处是"下下周三"这类说法不支持。解析失败不报错，原样当标题。

### 2.2 命令面板 / 全局快捷键 / 深链

- **命令面板**：`Ctrl/⌘+K` → `ui/CommandPalette.tsx`，输入即模糊匹配任务与项目（复用 `lib/fuzzy`），回车跳转；输入不匹配任何条目时按"新建任务"处理。
- **全局快速收集**：`Ctrl+Shift+Space` 由 Electron `globalShortcut` 注册（`desktop/main/main.ts`），窗口不在前台也能弹出收集框。
- **深链**：`gtd://add?title=买牛奶&notes=…` 由 `expo-linking` 解析，`app/add.tsx` 读 query 直接建任务（含桌面 `setAsDefaultProtocolClient`）。

---

## 3. 理清（Clarify）

**用户看到**：收集箱点「理清」→ 一次一条，顶部进度「3/12」，每条给出**建议动作 + 理由**，9 个动作按钮；桌面可按 `1–9` 选、`←/→` 切。

**实现**（`features/clarify.ts`）：

1. `recommendedClarify(task, now)` 用**决策树**给出推荐：
   - `status=waiting/someday/next` → 直接对应动作（reasonCode `clarify.reason.status*`）；
   - 有 `waitingFor` → 建议「等待」；
   - `isTwoMinuteTask(task)`（标题/标签含 `2分钟`/`2min`）→ 建议「2 分钟做掉」；
   - `isMultiStepTask(task)`（有清单子项/笔记含多行）→ 建议「转项目」；
   - 否则 → 「下一步行动」。
2. `clarifyOptions(task, now)` 产出 9 个选项（`next/waiting/someday/done/trash/twoMinute/delegate/project/defer`），每条带 `recommended` 标记与 hint 文案。
3. `clarifyProgress(state)` 给出 `未理清/总数`，页面顶部进度条与"还剩 N 条"都用它。
4. 动作落地仍是命令：`task.moveStatus` / `task.create`（转项目时建项目 + 任务）/ `task.complete` / `task.softDelete` / `task.update`。

**取舍**：建议只是建议，UI 不隐藏其它选项；不做"自动批量理清"（那会把判断权从用户手里拿走）。

---

## 4. 组织（Organize）

### 4.1 四层组织：区域 → 项目 → 分区 → 任务

- **区域**（`areas`）：项目分组，`orderKey` 排序。
- **项目**（`projects`）：`kind: sequential | parallel`。`sequential` 时 UI 只高亮**第一个未完成任务**作为"下一步行动"；`parallel` 时所有任务是并行可推进项。项目还有 `reviewIntervalDays/lastReviewedAt` 支撑"该回顾的项目"。
- **分区**（`sections`）：项目内再分组（`section.create`），任务用 `sectionId` 挂载。
- **任务**（`tasks`）：`projectId` 可为空（收集箱）。

### 4.2 情境与标签

- **情境**表示"在哪做"（`@电脑`），一个任务可多个（`contextIds[]`）；筛选栏按情境过滤。
- **标签**表示"多维检索"（`+本周`），`features/tags.ts#normalizeTags` 统一小写去重去空白，避免 `#Work` 与 `#work` 重复建。

### 4.3 排序：分数索引 `orderKey`

拖拽排序不做"整表重排"，而是给被移动任务算一个介于左右邻居之间的 `orderKey`（`task.reorder`），其余行不动 → O(1) 写、跨设备合并时也不会互相覆盖整列顺序。

### 4.4 保存的筛选（视角）

`hooks/usePerspectives` 把当前 `{query, contextId, tag, overdueOnly}` 存成一条 kv 记录（名称 + 条件）。点一下回填全部筛选条件，提供"清空当前视角"。视图上它是**筛选的快捷方式**，不是新的数据维度。

---

## 5. 执行（Engage）

### 5.1 今天：只显示今天该做的

`store/selectors/tasks.ts#getTodayTasks(state, now)`：`status !== done && dueAt !== null && dueAt <= endOfDayOf(now) && !isDeferred(task, now)`，按 `dueAt` 升序。
`isDeferred` 看 `deferUntil > now`——被"推迟"的任务在到期前不出现在今天。

子视图（`ui/ViewToggle`）：`列表 / 即将 / 日历 / 时间线`。手机端只保留前两个，日历收进「更多视图」菜单，时间线要求 ≥1440 宽（桌面/平板）。

### 5.2 专注：范围缩到 3 件事

`starred` 字段 = "选入专注"。专注页 = 已选中的下一步行动 + 今日到期 + `ui/Pomodoro`（默认 25 分钟，可传 `minutes`）；番茄结束回调里可一键完成当前任务（走 `task.complete` + 撤销栈）。

### 5.3 任务详情：一个页面管完所有字段

`ui/TaskDetailContent.tsx` 是受控展示组件，页面 `app/task/[id].tsx` 负责取值与命令。字段编辑一律即时 `task.update`（无"保存"按钮）：
标题/笔记（Markdown 只读渲染走 `ui/MarkdownView`，链接白名单 http/https）、状态、优先级、到期、开始/推迟、项目、分区、情境、标签、清单、附件、重复规则、"另存为模板"、删除。

### 5.4 重复任务：完成即推进

`features/recurrence.ts#nextOccurrence(from, rule, now)` 支持 `daily/weekly/monthly/yearly/weekdays/afterCompletion` 六种 `freq`，配合 `interval`（每 N）、`byWeekday[]`、`lastWeekday`（"每月最后一个工作日"）、`remainingCount`（次数用尽即终止）、`until`（截止日）。
**语义**：完成任务时不进"已完成"，而是把 `dueAt` 推进到下一次、把本次时间记进 `lastCompletedAt`（`db/commands/task.ts`）；只有次数用完 / 超过 `until` 才真正结束。

### 5.5 手势与批量

| 手势 | 实现 |
|---|---|
| 左滑完成 | `useListInteractions.swipeLeft` → `completeTaskWithUndo`（带撤销） |
| 右滑延后 | `swipeRight` → `planDeferToTomorrow`（明天 09:00，撤销回原 `deferUntil`） |
| 长按多选 | `selectionMode` → `BulkActionBar` |
| 拖拽排序 | `reorderMode` → `task.reorder` |

批量动作的**命令规划**放在 core（`features/bulk-ops.ts`）：`planBulkComplete/Delete/Move/Defer` 各自返回 `{run, undo}` 两组命令，UI 只负责逐条执行 + 弹撤销条。放在 core 的原因：可单测（8 条用例）、桌面端可复用、失败语义明确（逐条事务，单条失败不影响已成功部分）。

### 5.6 看板

`ui/KanbanBoard.tsx`：列 = 任务状态；`features/kanban-dnd.ts` 提供 `hitColumn(rects, x)`（落点判定）、`resolveDrop(...)`（目标列 + 是否越阈值）、`exceedsDragThreshold`（6px 防误触）。松手调用 `task.moveStatus`。

---

## 6. 撤销、回收站与清理

### 6.1 撤销栈

`ui/lib/undo-stack.ts`：**有界 10 层 + 60 秒 TTL** 的纯函数栈（`pushUndo/popUndo/pruneUndo/peekUndo`）。
`ui/UndoBar.tsx` 把它接到全局：`showUndo(message, undoFn)` 入栈 → 底部提示条 4 秒 → 可点「撤销」/`Ctrl+Z`；提示条还会显示「还可撤销 N 步」，点开是历史面板（`undoLast/undoAll`）。
**为什么不做无限撤销**：撤销执行的是反向命令（重新 create/update/restore），栈越深越容易跨语义边界（比如撤销一个已被同步覆盖的记录），10 步是"够用且不会害人"的界。

### 6.2 软删除与回收站

删除一律 `deleted_at` 软删（`task.softDelete` 等），记录保留 → 回收站（`app/trash.tsx`）可 `task.restore` 恢复。
90 天后由 `features/tombstones.ts#maybeCompactTombstones` 物理清理（每 24 小时最多跑一次，门控键 `kv["tombstone.lastCompactAt"]`）；压缩前会保证墓碑已参与过同步，否则删掉墓碑会让别的设备"复活"记录。

### 6.3 最近操作页

`app/recent.tsx` 复用撤销栈（`listUndo`），展示最近 10 步 + 时间 + 一条「撤销上一步」/「全部撤销」。撤销按 LIFO 执行，所以页面不提供"删中间某一步"。

---

## 7. 回顾（Reflect）

### 7.1 每周回顾

`features/review.ts#buildReviewSummary` 一次性算出六步所需数据：

| 步骤 | 数据 |
|---|---|
| 收集箱 | 未理清条数 |
| 项目 | 没有下一步行动的项目 |
| 日程 | 未来两周到期 |
| 等待中 | `status=waiting`（含 `waitingFor`） |
| 将来也许 | `status=someday` |
| 完成 | 本周完成数 |

外加顶部四块：该回顾的项目（按 `reviewIntervalDays` 与 `lastReviewedAt` 判定）、长期未推进项目、近 8 周完成趋势、整体进度。走完六步写 `kv["review.lastAt"]`，更多页据此显示"距上次回顾 N 天"红点。

### 7.2 统计面板

`features/stats.ts#computeStats(state, now, {days})` → `{completed7d, completed30d, completionRate7d, streakDays, dailyBuckets[], byProject[], byContext[], throughputPerDay}`。
"完成时间"取 `completedAt ?? lastCompletedAt`（重复任务只有后者），所以重复任务的完成也会进趋势。

### 7.3 四象限

`features/matrix.ts`：
- `isImportant`：优先级 ≥2 / 星标 / 挂项目的到期任务；
- `isUrgent`：`URGENT_WINDOW_MS = 48 小时`内到期或已逾期；
- `classifyQuadrant` → `q1..q4`，`groupByQuadrant` 出四组。

### 7.4 搜索

`features/search.ts#searchAll(state, query, now)`：跨任务/项目/标签/情境，按字段权重 `FIELD_RANK`（标题 0 < 笔记 1 < 标签 2 < 情境 3）排序，返回 `SearchHit{... snippet}`（围绕命中位置截 `SNIPPET_RADIUS=20` 字符），UI 用 `ui/Highlight.tsx` 高亮命中的子串。

---

## 8. 模板

- **数据**：`models/task.ts#TaskTemplate`（`name` + 任务骨架字段，**不存日期与完成态**），表 `task_templates`（schema v5）。
- **命令**：`template.upsert`（有 id 则更新，无 id 按名 find-or-create）、`template.instantiate`（单事务建任务 + checklist 重新生成 id）、`template.softDelete`。
- **UI**：详情页「另存为模板」→ `template.upsert`；更多 → 洞察 → 模板页可新建/使用/删除。
- **取舍**：模板实例化不复制日期，避免"模板里的日期永远是旧的"。

---

## 9. 数据进出

- **导出**：`features/exporters.ts` 三个纯函数 `toMarkdown / toICS / formatBackupJSON`；`platform/export-actions.ts#saveTextFile` 负责落地（桌面 dialog、Android SAF、iOS 分享）。
- **导入**：`features/importers.ts`（Markdown / Todoist / TickTick / 通用 CSV，上限 5000 条）→ `app/import.tsx` 逐条 `task.create`；JSON 走 `import.merge` 命令（300 条/批）。
- 详细格式规格见 **`import-export-formats.md`**。

---

## 10. 同步

- **编排**：`sync/service.ts#syncNow`（7 步，见 `sync-overview.md`）；
- **合并**：`sync/merge.ts`（整条 LWW）+ `sync/fieldmerge.ts`（任务字段级 3-way，基线表 `record_base`）；
- **调度**：`sync/auto.ts`（防抖/间隔/退避，纯逻辑）+ `platform/sync-scheduler.ts`（AppState + store 订阅）；
- **Provider**：`sync/providers.ts`（WebDAV / 自托管 HTTP / 文件夹）、`sync/s3.ts`（SigV4）；
- **密码学**：`sync/crypto.ts`（纯 JS SHA-256 / HMAC / Base64，Hermes 兼容）；
- **凭据**：`platform/secret-store.ts`（桌面 safeStorage / 移动 Keychain·Keystore）。

详见 **`sync-overview.md`**。

---

## 11. 交互与反馈基建

| 基建 | 实现 | 为什么要统一 |
|---|---|---|
| Toast | `ui/theme/feedback.tsx#showToast`（`ToastHost` 挂在根布局） | RN Web 的 `Alert` 静默失效，自建才三端一致 |
| 确认框 | `ui/components/PromptHost.tsx#showConfirm` | 同上；返回 Promise 便于 `await` |
| 输入框 | `ui/components/PromptHost.tsx#showPrompt` | 同上（模板保存用它） |
| 底部弹层 | `ui/Sheet.tsx` / `ui/OptionSheet.tsx` | 触控目标 ≥44、三端一致 |
| 撤销条 | `ui/UndoBar.tsx#UndoHost` | 全局单实例，浮在 tab bar 之上 |
| 空态 | `ui/EmptyState.tsx`（5 种插画 + 主/次行动 + 可点语法片段） | 空态是新用户唯一会认真读的地方 |
| 键盘快捷键 | `ui/lib/shortcuts.ts#matchesShortcut` + `platform/useKeyboardShortcuts.web.ts` | 输入框内自动让位（`isEditableTarget`） |

---

## 12. 平台能力

| 能力 | 实现 |
|---|---|
| 大字体防御 | 三道防线：`platform/font-scale.ts` 覆盖 `Text.render`/`TextInput` 默认值；`ui/theme/AppText.tsx` 强制 `allowFontScaling={false} maxFontSizeMultiplier={1}`；CI 构建时向 `MainActivity` 注入 `attachBaseContext` 把 `fontScale` 锁 1.0 |
| 内置字体 | `platform/font-loader.ts` 懒加载霞鹜文楷（19MB），只有 `kv["font.family"]=LXGWWenKai` 时才载入 |
| 主题 | `ui/theme/tokens.ts`（"纸与墨"浅/深两套）+ `ThemeProvider` 读 `kv["theme.mode"]`，改设置即时生效 |
| 语言 | `packages/ui/src/i18n`（zh / en 各 **638** 个键）；`useT()` 订阅语言变化，桌面原生菜单也读同一份字典 |
| 通知 | `features/due-scan.ts`：每日概览（只写日期的任务）+ 时刻提醒（到期后 5 分钟窗口内，单轮上限 5 条），去重键写 kv；`platform/bootstrap.ts` 每 60 秒扫一次 |
| 桌面托盘/菜单 | `desktop/main/{window,menu}.ts`：关闭窗口 → `preventDefault + hide`（最小化到托盘），菜单项与快捷键集中定义 |
| 原生右键菜单 | 渲染层传菜单项 → `ipc.ts` 用 `Menu.popup` 弹系统菜单（`contextMenu`） |
| 本地备份 | `desktop/main/backup.ts`：`VACUUM INTO` 生成一致性快照（不停库），每日自动 + 手动，保留最近 7 份 |
| 自动更新 | `desktop/main/updater.ts`（electron-updater，**未实测**） |
| 冒烟 | `desktop/main/smoke.ts` + `apps/desktop/tests/*`：无窗口环境下验证命令与 IPC |

---

## 13. 数据层与状态

### 13.1 表结构

| 表 | 用途 | 关键索引 |
|---|---|---|
| `tasks` | 任务（含 `orderKey`/`revision`/`deleted_at`） | `(project_id)`、`(due_at)`、`(deleted_at)` |
| `projects` / `sections` / `areas` / `contexts` | 四层组织 | `(area_id)`、`(project_id)` |
| `task_templates` | 模板骨架（v5） | `(deleted_at)` |
| `attachments` | 附件元数据 | `(task_id)` |
| `record_base` | 字段级合并基线（v6） | `(captured_at)` |
| `kv` | 设置/设备 id/同步配置（不参与同步） | 主键 `key` |

迁移 v1→v6 全部**幂等**（`IF NOT EXISTS` + 版本表），每条迁移单独事务；`db/migrations.ts#migrate` 返回本次执行条数（测试断言二次执行返回 0）。

### 13.2 命令架构

```ts
runCommand(op, payload)
  → COMMAND_REGISTRY[op].schema.parse(payload)   // zod，非法即 AppError("validation_failed")
  → executor.transaction("immediate", handler)   // 单命令单事务，绝不跨命令长事务
  → CommandResult { ids, records, serverTime }   // 结构化克隆安全（无函数/无类实例）
  → applyRecords(records)                        // 写 store，UI 自动重渲染
```

23 个 op 全部显式注册（`db/commands/index.ts`），payload 类型由 `CommandMap` 约束；**IPC 白名单**（`desktop/main/ipc.ts`）只放行注册过的 op，杜绝任意 SQL/任意命令。

### 13.3 状态与派生

`appStore`（zustand vanilla）只存"库的镜像"（tasks/projects/templates/kv…），**所有派生逻辑都放 `store/selectors/*` 纯函数**（`time.ts`/`tasks.ts`/`projects.ts`/`filters.ts`）。
React 侧用 `useAppStore(selector)`；注意 React #185 陷阱：selector 里**不能返回新对象**（必须 `useShallow` 或返回原始值）。

### 13.4 性能

- 列表用 `FlatList` + 稳定 `keyExtractor`（`initialNumToRender 14`、`maxToRenderPerBatch 12`、`windowSize 9`、Android `removeClippedSubviews`）；
- 排序计算走 `orderKey`（不做整表重排）；
- 统计/搜索/四象限都是纯函数，输入不变则 `useMemo` 命中；
- 同步分批 300 条，批间释放事务，避免长事务阻塞用户操作。

---

## 14. 测试策略

| 层 | 文件数 | 覆盖 |
|---|---|---|
| core：纯算法 | 8 | 快速添加、理清、搜索、统计、四象限、批量、看板落点、筛选 |
| core：数据与命令 | 4 | 迁移（含幂等）、命令回归、coerce、IPC 可序列化 |
| core：同步与导入导出 | 7 | 迁移/合并、自动调度、字段级合并、设备列表、加密向量、导入、导出 |
| ui | 5 | 对比度、无障碍审计、模糊匹配、token、撤销栈/快捷键 |
| desktop | 3 | 命令回归、同步、IPC/备份 |

`bun test packages/core packages/ui apps/desktop/tests` → **337 条 / 27 文件**。
另有 `doc-conformance.test.ts`：**文档里写的版本号/命令清单/迁移数必须与代码一致**，防止文档漂移。

---

## 15. 目录地图（想改某功能时去哪）

| 想改什么 | 去哪 |
|---|---|
| 解析语法（`@ # ! 明天`） | `packages/core/src/features/quick-add.ts` |
| 理清建议逻辑 | `features/clarify.ts` |
| 重复规则推进 | `features/recurrence.ts` + `db/commands/task.ts#task.complete` |
| 统计口径 | `features/stats.ts` |
| 搜索排序/摘要 | `features/search.ts` |
| 四象限阈值 | `features/matrix.ts` |
| 导出格式 | `features/exporters.ts` |
| 导入解析 | `features/importers.ts` |
| 同步编排 | `sync/service.ts` |
| 合并规则 | `sync/merge.ts` / `sync/fieldmerge.ts` |
| 自动同步节奏 | `sync/auto.ts`（参数在 `platform/sync-scheduler.ts`） |
| 加一个命令 | `models/commands.ts`（类型+op）→ `db/commands/<域>.ts`（handler+schema）→ `db/commands/index.ts`（注册）→ 桌面 `ipc.ts` 白名单 |
| 加一屏 | `apps/mobile/src/app/*.tsx` + `app/_layout.tsx` 注册 `Stack.Screen` + i18n 键 |
| 改设计语言 | `packages/ui/src/theme/tokens.ts`（唯一真源） |
| 改文案 | `packages/ui/src/i18n/index.ts`（zh/en 必须同时加） |

---

## 16. 明确没做的（避免误解）

| 没做 | 原因 |
|---|---|
| 多人协作 / 共享清单 | 架构是"单人多设备 + revision LWW" |
| 账号与官方云 | 本地优先定位 |
| AI 自动排期 | 解析器保持确定性，可测可解释 |
| 字段级合并（任务以外） | 项目/情境等字段少、冲突概率低，整条 LWW 够用 |
| ICS 反向导入 | 日历 → 任务涉及大量语义映射，收益低 |
| 端到端加密同步 | 服务端看到明文 JSON，依赖 HTTPS（记为待办） |
| 附件二进制云同步 | 只同步元数据，文件本体留在设备上 |
| 真机自动化测试 | 只有单测 + web 导出 + 桌面无头冒烟，真机靠人工验 |

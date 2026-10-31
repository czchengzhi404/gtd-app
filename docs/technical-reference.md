# GTD 清单 · 技术文档

> 版本：v0.11.0（2026-10-31） · 适用仓库：`czchengzhi404/gtd-app`
> 定位：本文是**全功能 + 全架构**的单一参考。接入指南见 [sync-providers.md](./sync-providers.md)，UI 设计系统细则见 [ui-design-system.md](./ui-design-system.md)，安全审计见 [security-audit-2026-10-25.md](./security-audit-2026-10-25.md)。

---

## 1. 产品概览

本地优先（local-first）的 GTD 任务清单应用。**一套 UI，四端运行**：

| 端 | 技术 | 状态 |
|---|---|---|
| Windows / macOS / Linux | Electron 43 壳 + Expo web 导出产物（`app://` 协议加载） | 全功能 + 原生增强 |
| Android | Expo SDK 57（RN 0.86.3），签名 release APK | 全功能 |
| iOS | 同一代码库（Expo），类型检查保障 | 未真机验证 |

**核心原则**：
- 数据默认留在设备（SQLite），无账号即可使用；
- 同步/云备份为**可选增强**（WebDAV / S3 / 自托管 / 本地文件夹）；
- GTD 决策逻辑**只写一次**（`packages/core`），Electron 壳与 Expo 壳零业务逻辑；
- 平台差异只允许出现在少量 `*.web.tsx` / `*.native.tsx` 文件中。

---

## 2. 技术栈

| 层 | 选型 | 关键版本 |
|---|---|---|
| 包管理 | Bun workspaces（`linker = "hoisted"`，`bunfig.toml` 先于首次 install） | Bun 1.4.4 |
| 业务核心 | 纯 TypeScript + zod + zustand/vanilla | zod 4.x, zustand 5 |
| UI | React Native primitives（web 经 react-native-web），@expo/vector-icons | RN 0.86.3 / RNW 0.21 |
| 移动壳 | Expo SDK 57 + Expo Router（`web.output: "single"` SPA） | expo ~57.0.31 |
| 桌面壳 | Electron（main/preload 手写，esbuild 打包） | 43.8.3 |
| 桌面存储 | better-sqlite3（N-API 预编译，主进程独占） | ≥13.0.3 |
| 移动存储 | expo-sqlite（渲染进程） | ~57.0.4 |
| 桌面打包 | electron-builder（NSIS/AppImage/dmg，`npmRebuild: false` + asarUnpack `**/*.node`） | 26.x |
| CI | GitHub Actions（零制品存储架构，直发 Release） | action 按 SHA 固定 |

---

## 3. 系统架构

### 3.1 Monorepo 结构

```
packages/core   数据模型 / 命令表 / SQL / quick-add / 重复规则 / 同步合并 /
                zustand vanilla store / 存储端口（纯 TS，零 React/RN，可在主进程跑）
packages/ui     跨平台组件 + 设计 tokens + i18n + 平台差异文件（.web/.native）
apps/mobile     Expo 通用应用（android/ios/web 三目标），web 产物即桌面渲染层
apps/desktop    Electron 壳（窗口/托盘/快捷键/通知/菜单/dialog/fs/SQLite/备份/加密）
```

依赖方向：`mobile → ui → core`；`desktop(main) → core`（desktop 渲染层 = mobile 的 web 导出）。

### 3.2 数据流（命令架构）

```
UI 事件 → runCommand(op, payload)
            ├─ 移动端：expo-sqlite executor 在渲染进程直接执行
            └─ 桌面端：IPC `command(op, payload)` → 主进程白名单校验 → core 执行
         → zod 校验（失败即抛）→ immediate 事务执行 handler
         → CommandResult { records[] } → applyRecords 写入 vanilla store
         → React 通过 useAppStore(useShallow(selector)) 订阅
```

- **命令是唯一写入口**：`{ op, payload }`，payload 必须可结构化克隆（有专项测试把守）；
- **所有写事务 = immediate**（含 `sync.applyRemote`），读查询不用事务；
- 桌面端 IPC 另有 `db:query`（SELECT-only 白名单校验：禁多语句/ATTACH/写 PRAGMA）与命令级白名单表；
- store 是 zustand/vanilla，selector 全部纯函数 —— React 绑定只在 ui 包（`useAppStore` 内套 `useShallow`，**返回新对象的 selector 禁止直接喂 useShallow**，会触发 React #185 死循环，v0.10.0 的教训）。

### 3.3 桌面进程模型

- 主进程：SQLite 连接（WAL + busy_timeout=5000）、命令分发（`enqueueDb` 串行队列）、托盘、全局快捷键、菜单、通知、dialog/fs（`allowedRoots` 限制）、备份、safeStorage、自动更新检查；
- 渲染进程：Expo web 导出产物，经自定义 `app://gtd/` 协议加载（静态命中 + SPA fallback 到 index.html，路由刷新不 404）；
- preload：`contextBridge` 暴露类型化 `window.gtd`，事件走白名单（`menu:action`、`tray:quick-add`、`notification:click`、`shortcut:triggered` 等）。

---

## 4. 数据模型

### 4.1 BaseRecord（所有记录的底座）

```ts
{ id: uuidv7; createdAt; updatedAt; revision; deletedAt: number | null }
```

- **uuidv7**：时间有序，天然可排序；
- **revision**：同步合并的第一决胜键（见 §8.2）；
- **软删除墓碑**：`deletedAt` 置时间戳；**超过 90 天的墓碑由 `compactTombstones` 物理删除**（bootstrap 时每日至多执行一次，kv `tombstone.lastCompactAt` 门控）。取舍：超过 90 天未同步的设备将看不到这些删除（该记录会"复活"参与后续合并），此为已文档化语义。

### 4.2 实体

| 实体 | 字段要点 |
|---|---|
| **Task** | `title`、`notes`(Markdown)、`status: inbox/next/waiting/someday/done`、`priority: 0-3`、`dueAt?`、`deferUntil?`（开始日期）、`completedAt?`、`lastCompletedAt?`、`projectId?`、`sectionId?`、`contextIds[]`、`tags[]`、`waitingFor?`、`starred`、`recurrence?`、`checklist[]`（内嵌 `{id,title,done,orderKey}`）、`orderKey`（"0001" 式四位序，`task.reorder` 整组重写） |
| **Project** | `name`、`description`、`kind: sequential/parallel`、`status: active/onHold/done`、`color?`、`areaId?`、`reviewIntervalDays`(默认 7)、`lastReviewedAt?` |
| **Section** | 项目内分组：`projectId`、`name`、`orderKey` |
| **Context** | 情境（@电脑 等）：`name`、`color?`、`icon?`，按名 find-or-create |
| **Area** | 区域（项目上层分组）：`name`、`color?`、`orderKey` |
| **Attachment** | `taskId`、`fileName`、`mimeType`、`size`、`storagePath`（元数据入库，二进制在文件系统） |
| **KV** | 设置键值（不同步）：`lang`、`theme.mode`、`font.family`、`sync.config`、`sync.log`、`sync.last`、`review.lastAt`、`filters.saved`、`seeded` 等 |

### 4.3 重复规则（RecurrenceRule）

```ts
freq: "daily" | "weekly" | "monthly" | "yearly" | "weekdays" | "afterCompletion"
interval: number        // 2 = 双周/每隔两天
byWeekday?: number[]    // 每周一三 → [1,3]（仅 weekly）
lastWeekday?: boolean   // 每月最后一个工作日（monthly 专用，优先于日序）
remainingCount?: number | null   // 完成时递减，归零任务结束
until?: number | null   // 截止时间
```

完成语义（`task.complete`）：按规则推算 `nextOccurrence` 生成下一条（保留时间点的 atPreservedTime 逻辑），`afterCompletion` 以完成时刻为基准；`remainingCount` 递减归零则不再生成。`weekdays` 跳过周六周日。
**无到期日的重复任务**（如"每天"未带日期）：完成时以**完成时刻为锚点**推进（`anchor = dueAt ?? 完成时刻`），下一条 dueAt = 锚点 + 周期。

### 4.4 数据库迁移

| 版本 | 内容 |
|---|---|
| v1 | 核心表：tasks/projects/sections/contexts/attachments/kv/meta（meta 必须先建） |
| v2 | `ALTER TABLE tasks ADD defer_until`；projects 加 `review_interval_days`(默认7)、`last_reviewed_at` |
| v3 | `tasks.tags TEXT DEFAULT '[]'`；`areas` 表；`projects.area_id` |

纪律：SQL 一律**调用点内联静态字面量 + 参数绑定**，动态字段走白名单映射，禁止任何拼接（Mimosa 安全 hook 与人工 review 双重把守）。SQL 参数按字段名显式构造（曾因索引偏移错位踩坑）。

---

## 5. 功能规格

### 5.1 快速添加（自然语言解析）

入口：收集箱输入框、桌面托盘/快捷键、深层链接 `gtd://add?title=...`、命令面板新建。
纯函数 `parseQuickAdd(text, now)`，解析后的**残余文本即标题**，UI 实时预览，落库走 `task.create`。

| 语法 | 效果 |
|---|---|
| `@电脑`（可多个） | 情境（find-or-create） |
| `#项目` | 归入项目（按名 find-or-create，并行类型） |
| `+标签`（可多个） | 标签（normalizeTag：去#、压空白为`-`、去 `#@+>!`、限 24 字符、大小写不敏感去重） |
| `!` / `!!` / `!!!` | 优先级 1/2/3 |
| `>张三` | waitingFor = 张三，并建议状态 waiting |
| `今天/明天/后天/大后天/today/tomorrow` | 到期日，**统一默认 18:00** |
| `周X / 星期X / 礼拜X` | 本周（已过则下周） |
| `下周X / next monday` | 下周对应日 |
| `N天后 / in N days` | 相对日期 |
| `10月1日 / 10-01 / 2026-10-01` | 绝对日期（今年已过 → 明年） |
| `上午9点 / 下午3点30 / 晚上8点 / 15:30 / 3pm / 9am` | 修饰当日时刻（无日期时默认今天；无时刻时统一 18:00） |
| `每天 / 每日 / daily` | daily |
| `每周 / 每周X / 每周一三`（紧凑与空格分隔均可） | weekly（interval=1，byWeekday） |
| `双周 / 每两周 / biweekly` | weekly interval=2 |
| `每月N日 / monthly` | monthly；首次到期 = 本月 N 日，已过则**下月** N 日 |
| `每年M月D日 / yearly` | yearly；首次到期 = 今年该日，已过则明年 |
| `每月最后工作日` | monthly + lastWeekday |
| `每工作日` | weekdays（跳过周末） |
| `每N天`（N≥1）/ `每隔N天`（N≥1，传统"隔 N 天"语义，最小 2） | daily interval：`每1天`=1、`每3天`=3、`每隔1天`=2 |
| `完成后N天` | afterCompletion interval=N |
| `重复N次` | remainingCount=N，**可与任意 freq 叠加**；归零终止判定在 `task.complete` |

### 5.2 收集与理清（GTD 状态流）

- 状态：`inbox → next / waiting / someday → done`（看板四列即四状态，拖拽跨列 = `task.moveStatus`）；
- 理清入口：任务详情「移动到」四 chip；快速添加 `>` 直接进等待中；
- **开始日期（defer）**：`deferUntil` 未到的任务从收集箱/今天/专注/项目视图隐藏（`isDeferred`），到期自动重新出现；详情页提供 立即/明天/下周 快捷设置。

### 5.3 任务能力

| 能力 | 说明 |
|---|---|
| 优先级 | 0-3，行上 P1-P3 徽标，详情 chip 修改 |
| 到期时间 | 行上 DueDateChip（今天/明天/逾期红字），日历视图按日聚合 |
| 重复 | 见 §4.3；快速添加可解析全部形式 |
| 清单子项 | 内嵌 checklist，详情页增删/勾选；随记录参与同步合并 |
| 标签 | 详情页 TagEditor（建议来自全库在用标签）；筛选 chip；行上 `#标签` chip |
| 笔记 | Markdown 渲染（自研解析器：无 RegExp.exec 的行级扫描；链接仅 http/https 白名单） |
| 附件 | 桌面 dialog / 移动 DocumentPicker（复制进 documentDirectory，规避 content:// 授权失效）；打开：桌面 shell.openPath |
| 星标 | 选入专注视图 |
| 开始日期 | deferUntil（§5.2） |

### 5.4 项目

- 顺序/并行：顺序项目在详情高亮**下一个行动**（首个未完成）；
- Section 分组：详情按 section 分组渲染；
- **区域分组**：Area（v3 迁移），项目列表 SectionList 按区分组（未分组殿后），详情页 chip 改归属；区域可新建/改名/删除（删除先解绑项目）；区域墓碑回落未分组（selector 有专项测试）；
- 回顾周期：`reviewIntervalDays` + `project.markReviewed`，回顾向导中列出超期项目并可一键标记。

### 5.5 视图

| 视图 | 位置 | 说明 |
|---|---|---|
| 列表 | 收集箱/今天/项目详情 | 单卡片 + 分隔线；状态竖条（逾期红/今天黄/等待灰）；行内排序 |
| 看板 | 收集箱 | 四状态分列，PanResponder 拖拽跨列 |
| 日历 | 今天 | 月历 + 按日任务 |
| 即将 | 今天 | 未来 14 天按日分组（`getUpcomingGroups`），相对标签（明天 · 周三） |
| Timeline | 今天（≥1024 显示） | 只读时间轴 |
| 专注 | 独立 tab | 已星标行动 + 今日到期 + 番茄钟（有星标任务时显示「正在专注：xxx」+ 一键完成） |
| 完成记录 | 更多 | 按完成日分组归档，可恢复（uncomplete） |
| 回收站 | 更多 | 墓碑任务列表（按删除时间倒序，上限 200），一键恢复（`task.restore`，可再撤销） |

### 5.6 筛选与保存的筛选

- 维度：关键词（标题/笔记/标签，忽略大小写）+ 情境 + 标签 + 只看逾期，全部 JS 侧过滤；
- **保存的筛选（Perspective）**：当前筛选存 kv `filters.saved`（JSON，≤20 条，本机不同步）；点击应用、长按删除（跨端确认框）；
- 宽屏（≥768）筛选收进搜索框右侧**漏斗弹层**（激活数徽标）；窄屏为横向滚动 chip 行。

### 5.7 列表交互

| 交互 | 行为 |
|---|---|
| 长按行 | 进入多选模式 → 底部批量操作条（完成/移动状态/删除/取消），逐条命令执行 + 一次撤销回滚整批 |
| 左滑行 | 完成（可撤销） |
| 右滑行 | 延后到明天 9:00（可撤销） |
| 排序模式 | ViewToggle 行尾 ↕ 开关；显示拖拽把手，按行高 56px 换算目标位，`task.reorder` 落库 |
| 右键（桌面） | 原生 ContextMenu（打开/星标/完成/上移/下移/删除） |
| 行尾 ⋯ | 底部动作面板（重命名/排序/删除；重命名用跨端 PromptHost，Android 无 window.prompt） |
| 列表动效 | 原生端 LayoutAnimation 220ms 收拢（web 不启用） |

### 5.8 命令面板（Ctrl/Cmd+K）

- 模糊打分：全等 100 > 前缀 80 > 包含 60 > 子序列 30；
- 结果：任务 8 条 + 项目 4 条 + 「新建任务：xxx」兜底；
- 三处入口统一开关状态（vanilla `paletteStore`）：桌面菜单 Cmd/Ctrl+K（`menu:action palette`）、渲染层键盘监听（web 实现，`ctrl` 匹配 CmdOrCtrl 语义）、移动端共享；
- 键盘：↑↓ 选择、Enter 打开、Esc 关闭。

### 5.9 每周回顾（六步向导）

收集箱 → 项目（无下一步行动清单）→ 日程（近 7 天完成 / 未来 14 天到期）→ 等待中 → 将来也许 → 完成。
完成后写 `review.lastAt`；含 8 周完成趋势条形图、长期未推进项目、项目回顾周期提醒（`reviewIntervalDays` 超期列表 + 标记已回顾）。
More 页在距上次回顾 ≥7 天（或从未）时显示红点「该回顾了」。

### 5.10 通知

| 类型 | 机制 |
|---|---|
| 每日到期概览 | `pickDueNotifications`：当天到期未提醒的任务 |
| 定时提醒 | `pickTimedNotifications`：带时刻的任务在到期前 5 分钟窗口内提醒（`TIMED_NOTIFY_WINDOW_MS = 5min`，键 `timed.<id>:<dueAt>` 防重复；纯日期任务不触发） |
| 扫描节奏 | 每 60s 轮询 |
| 通知点击 | 桌面经 `notification:click` 深链到 `/task/<id>` |

### 5.11 撤销系统

`showUndo(message, rollback)` → 底部撤销条（UndoHost 挂根布局）。覆盖：完成、删除（`task.restore` 清墓碑）、批量操作整批回滚、恢复、延后、排到今天。跨端（Modal 承载，非 RNW 未实现的 Alert）。

### 5.12 跨端对话框

`showPrompt`（输入）/ `showConfirm`（确认）— PromptHost 挂根布局。
存在理由：window.prompt 在 RN 原生不存在；Alert.alert 在 react-native-web 是空实现（此前桌面端删除确认静默失效的真实 bug）。

---

## 6. 桌面端（Electron）能力

| 能力 | 实现 |
|---|---|
| 系统托盘 | 模板图（自动适配深浅色），左键显隐窗口，右键菜单（快速添加/显隐/退出，随语言重建） |
| 全局快捷键 | `CmdOrCtrl+Shift+Space` 快速收集；`will-quit` 时 `unregisterAll()` |
| 应用菜单 | 双语（随 `settings.set lang` 重建）：新建 `Ctrl+N`、命令面板 `Ctrl+K`、快速收集 `Ctrl+Shift+K`、同步 `Ctrl+Shift+S`、回顾 `Ctrl+Shift+R`、搜索 `Ctrl+F`、专注 `Ctrl+Shift+F`、备份 `Ctrl+Shift+B`；编辑/视图/窗口用 role |
| 通知 | 原生 Notification + 点击回调 |
| 导入导出 | dialog + fs（限定 `allowedRoots`） |
| 本地备份 | `VACUUM INTO`（一致性快照不停库），每日自动 + 手动，保留 `BACKUP_KEEP = 7` 份，恢复后重启 |
| 密码加密 | safeStorage（Windows DPAPI / macOS Keychain / Linux libsecret），密文带 `enc:`/`b64:` 前缀存 kv `sync.config` |
| 原生右键菜单 | `menu:context` IPC + popup |
| 自动更新 | 检查 latest.yml，提示就绪（未实现静默安装） |
| 冒烟测试 | `--smoke`：渲染/路由刷新/静态资源/命令 E2E/菜单双语/托盘/快捷键/通知/文件夹同步双设备 |
| 离屏截图 | `--shot=WxH,out.png,route?dark=1&fontScale=2`（验收用） |

---

## 7. 同步系统（可选增强）

### 7.1 Provider

| Provider | 协议 | 说明 |
|---|---|---|
| 坚果云（预设） | WebDAV | endpoint 预填 `https://dav.jianguoyun.com/dav/`，邮箱 + 应用密码 |
| 自定义 WebDAV | WebDAV | 自写 fetch 客户端（PROPFIND/MKCOL/PUT/GET），**不用 axios**（Bun + Expo 导出兼容性） |
| 自托管 HTTP | REST | 自建服务端 |
| 本地文件夹 | fs | 桌面端专用（FilesPort） |
| S3 兼容 | AWS SigV4 | 阿里云 OSS / 腾讯 COS / MinIO；Web Crypto 签名 |

布局：`devices/<deviceId>/{manifest.json, records/}`，各端对等。

### 7.2 合并算法（决定论）

1. 交换 manifest（`id → {revision, updatedAt, deletedAt}`）；
2. 差异拉取整条记录（**不信任时间窗**，规避时钟偏差）；
3. 决胜：① revision 高者胜 → ② 并列比 updatedAt 新（仅 tiebreak）→ ③ id 字典序；
4. 墓碑按普通记录参与比较（被更高 revision 击败则"复活"，文档化）；
5. 写入：`sync.applyRemote` **每批一个独立 immediate 事务**（300 条/批），绝不与用户命令共享事务，批间显式释放；
6. 同步日志写 kv `sync.log`（应用/本地胜/远端胜 + 冲突清单，More 页可查）。

记录类型：task/project/section/context/**area**/attachment（含墓碑全表扫描，保证删除传播）。

### 7.3 云备份

复用 provider 通道上传 JSON 快照（`gtd-backup-<时间戳>.json`），下载/恢复到本地库。与本地 VACUUM 备份互补。

---

## 8. 移动端特性

- **存储**：expo-sqlite（渲染进程执行同一命令表）；
- **附件**：DocumentPicker → 复制到 `documentDirectory/attachments/` → 存元数据（content:// 授权临时，必须复制）；
- **数据出口**：expo-sharing 分享面板导出 JSON（手机不再是数据孤岛）；
- **深层链接**：`gtd://add?title=买牛奶`（浏览器书签/快捷方式一键捕获）；
- **字体**：**默认系统字体**；内置霞鹜文楷（19.3MB TTF）为可选项，**按需懒加载**（启动后按 kv 判断 + 设置页切换时补载，默认不载入）；
- **字体缩放防御**（针对小米/HyperOS 大字体错乱）：三层 —— AppText 唯一文本原语（allowFontScaling=false + 固定行高）→ 全局 installFontScaleOverride → CI 注入 MainActivity `fontScale=1.0`；
- **主题**：日夜两套 + 跟随系统（kv `theme.mode`）；
- **语言**：中文/英文（kv `lang`，全 UI 即时切换）。

---

## 9. UI 设计系统

- **tokens**（`packages/ui/src/theme/tokens.ts`）：space/radius/type/hit（触控目标）/elevation/motion/colors（亮暗两套，WCAG ≥4.5:1 已有对比度测试）；
- **AppText 唯一文本原语**：字号行高锁定（正文 16px）、allowFontScaling=false、默认单行省略 —— 所有文字必须经它渲染；
- **断点**：375 / 768 / 1024 / 1440；<768 底部 Tab（≤5 项，带红色数字徽标），≥768 侧栏 + 内容（TabBar 隐藏），内容轨道 max 880；
- **优先级纪律**（ui-ux-pro-max）：Accessibility → Touch → Performance → Layout → Typography/Color → Animation；
- **无障碍**：图标按钮一律 accessibilityLabel；触控 ≥44×44px 间距 ≥8px；焦点环可见；Tab 序 = 视觉序；跳转/弹层均有 role/state；
- **平台差异**：仅 5 处平台文件（DatePicker/ContextMenu/Modal/AttachmentPicker/useKeyboardShortcuts 的 .web/.native）。

---

## 10. 安全

- **SQL**：内联静态字面量 + 参数绑定，零拼接（自动化 hook + review 双把守）；
- **IPC**：命令白名单 + zod payload 校验 + 结构化克隆纪律 + 查询 SELECT-only 校验；
- **密钥**：safeStorage OS 级加密（DPAPI/Keychain/libsecret），不上传明文；
- **Markdown 链接**：仅 http/https；
- **CI**：action 按 commit SHA 固定（防 tag 劫持）；签名密钥库随私有仓库（转公开前须迁出）；Actions 零制品存储（防配额耗尽型 DoS）；
- **发请求纪律**：仅 http/https，host 校验拒绝回环/私有/保留地址。

---

## 11. 测试与质量门

| 门 | 内容 |
|---|---|
| 类型 | 四包各自 `tsc --noEmit` 严格模式 |
| 单测 | `bun test packages/core packages/ui apps/desktop/tests` — 177 项（文档符合性/命令可序列化/quick-add/批量规划/解析器语义/筛选/看板拖拽/P0/P1 特性/对比度/a11y 静态审计/模糊打分/桌面命令含回收站与墓碑压缩/同步双设备/SigV4） |
| 导出 | `expo export --platform web`（Bun 兼容硬验收） |
| 冒烟 | 桌面 `--smoke` 8 组断言（含命令 E2E 与文件夹同步双设备） |
| 截图巡检 | 离屏 `--shot`：375 亮/暗/2×字号 + 1280；专逮 smoke 覆盖不到的白屏（React #185 即由此发现） |

---

## 12. 构建与发布

```
版本号（JSON 解析式修改，禁 sed）→ 四包 tsc + 测试 + export + smoke + 截图
→ Git Data API 推提交（blob→tree→commit→ref，Python + gh api）
→ 打 tag（annotated，POST git/tags + git/refs）
→ CI：Android APK（签名注入 + apksigner 验签 + gh release upload）
      Windows/Linux（electron-builder --publish always）
      macOS（--publish never 构建 + 手工 upload，needs 串行防 422）
→ 核对资产时间戳（必须全部来自本次 run）→ PATCH draft=false + release notes
→ APK 下载本地校验（zipfile 全量 CRC）
```

**发布铁律**：重打标签前必须删草稿 + 删标签（取消的 run 会把旧提交资产留在草稿里造成污染）；`taskkill curl` 后只保留一条下载命令；校验以 `zf.testzip()` 为准。

---

## 13. 目录结构

```
packages/core/src
├─ models/          task.ts（实体+RecurrenceRule）/ commands.ts（zod schema 全集）
├─ db/              migrations / commands（命令表）/ queries / mappers / coerce
├─ features/        quick-add / recurrence / tags / due-scan / review / kanban-dnd /
│                   bulk-ops（批量命令规划）/ tombstones（墓碑压缩）
├─ sync/            types（含 SYNC_PRESETS）/ providers / s3 / merge / service
├─ store/           app-store（vanilla）/ selectors（纯函数）
└─ platform/        SqliteExecutor / NotificationsPort / FilesPort
packages/ui/src
├─ theme/           tokens / AppText / primitives
├─ components/      TaskList / TaskRow / TaskDetailContent / ProjectDetailContent /
│                   QuickAddBar / FilterBar / PerspectiveBar / CommandPalette /
│                   BulkActionBar / OptionSheet / PromptHost / TagEditor /
│                   KanbanBoard / CalendarView / TimelineView / UpcomingView /
│                   ReviewWizard / Pomodoro / MarkdownView / AppTabBar / Sidebar / …
├─ hooks/           useTheme / useAppStore / useBreakpoint / useFocusStyle
├─ lib/             fuzzy（命令面板打分，纯函数可单测）
├─ i18n/            中英双词典 + 插值
└─ platform/        useKeyboardShortcuts(.web/.native)
apps/mobile/src
├─ app/             Expo Router（(tabs) 五页 + task/project/review/completed/trash/add/about）
├─ platform/        bootstrap（端口注入+事件）/ desktop-actions / mobile-actions /
│                   CommandPaletteHost / palette-store / font-scale / font-loader /
│                   seed / env
└─ hooks/           useListInteractions（批量规划调 core bulk-ops）/ usePerspectives / useRowActions
apps/desktop/src
├─ main/            main.ts（窗口/托盘/菜单/IPC/备份/加密/冒烟/截图）
└─ preload/         preload.ts（类型化 window.gtd）
```

---

## 14. 版本脉络（摘要）

v0.2.x 签名 APK + 大字体防御 → v0.3.0 UI 重构（AppText 唯一原语）→ v0.4.0 筛选/撤销/附件/番茄钟/备份 → v0.5.0 看板拖拽+右键菜单 → v0.6.0 WCAG 对比度 → v0.7.0 同步预设+safeStorage → v0.8.0 云备份 → v0.9.0 开始日期/即将/定时提醒/完成记录/回顾周期 → v0.10.0 P1 全量（命令面板/拖拽/滑动/批量/保存筛选/标签/区域/移动附件/Markdown）→ **v0.11.0 三视角 UI 整改（排序模式/空态可行动/16px/回收站/速查/筛选弹层/状态竖条/徽标/动效/番茄钟绑定/移动导出/回顾红点/More 卡片化/插画变体）**

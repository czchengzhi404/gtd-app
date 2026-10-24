# GTD 清单 — 架构文档

本地优先（local-first）GTD 任务清单应用：Windows/macOS/Linux 桌面（Electron 壳）+ Android/iOS（Expo）。一套 UI（packages/ui，RN primitives，web 走 react-native-web），GTD 逻辑只写在 packages/core。

> 实施方案定稿为 v7（经四轮评审批准），本文记录定稿结论与阶段一实测结果。

## 1. 技术选型（定稿）

| 层 | 选型 | 说明 |
|---|---|---|
| 包管理 | Bun 1.4 workspace | `bunfig.toml` 显式 `linker = "hoisted"` |
| 移动/Web | Expo SDK 57（expo ~57.0.31 / RN 0.86.3 / RNW ~0.21） | SDK 58 仍是 beta，不采用 |
| 路由 | Expo Router | `web.output: "single"`（SPA，适配 BrowserWindow） |
| 桌面壳 | Electron 43.8.3（固定） | 零 GTD 逻辑；原生能力经 IPC |
| 桌面存储 | better-sqlite3 **13.0.3**（N-API 预编译） | 主进程独占访问 |
| 移动存储 | expo-sqlite | 经 core 的 SqliteExecutor 端口切换 |
| 状态 | zustand/vanilla（core）+ useStore 绑定（ui） | selector 纯函数，无 React 依赖 |
| 校验 | zod 4 | 命令 payload schema |
| 打包 | electron-builder（`npmRebuild: false`） | 阶段四完善签名/自动更新 |

**已否决**：@expo/electron-adapter（官方停止维护，基于 electron-webpack，不兼容新 SDK 静态导出）。稳定路线 = `expo export --platform web` 产物 + 原生 Electron 加载。同步客户端自写 fetch，**不引入 axios**（SDK 57 下 Bun + axios 的 follow-redirects 会触发 Babel `Error.prepareStackTrace` 交互缺陷，导致 expo export 的 static rendering 阶段失败）。

## 2. 命令架构（写路径）

- 写操作唯一入口：`command(op, payload)`。命令表定义在 `packages/core/src/models/commands.ts`（op → zod payload schema），实现在 `packages/core/src/db/commands/`。
- 执行位置随 SQLite 走：mobile=渲染进程（expo-sqlite executor）；desktop=Electron 主进程（import core，IPC 收 `{op, payload}`）。IPC 上只有可结构化克隆数据，**禁止函数**。
- payload 纪律由 `packages/core/src/__tests__/ipc-serializable.test.ts` 的 structuredClone 往返断言约束（当前 11 用例通过）。
- **事务语义（端口契约）**：`SqliteExecutor.transaction(fn, mode)`，mode ∈ immediate|deferred。所有写事务（用户命令与 `sync.applyRemote`）统一 **immediate**；只读查询不用事务或用 deferred。连接打开即设 `WAL + busy_timeout=5000`。`sync.applyRemote` 每批一个独立 immediate 事务（默认 200–500 条/批，批间显式释放）。
- **SQL 纪律**：一律参数绑定；`exec` 仅接受单一静态字符串字面量；动态字段（排序列等）走白名单映射。code review 硬检查项。

## 3. 同步合并策略（可选增强）

- 决胜顺序：① `revision` 高者胜 → ② revision 并列比 `updatedAt` 新者（仅 tiebreak）→ ③ `id` 字典序。revision 是单调本地计数器，决胜不依赖时钟。
- 增量同步不信任时间窗：先交换 manifest（`id → {revision, updatedAt, deletedAt}`），按 revision 差异拉整条记录。
- 软删除墓碑：`deletedAt` 记录按普通记录参与合并（被更高 revision 的编辑击败则"复活"，预期行为）；全设备 ack 后 90 天压缩。
- Provider：`pullManifest / pullRecords / push`，文件布局 `devices/<deviceId>/{manifest.json, records/}`。三种实现：WebDAV（自写 fetch）、自托管 HTTP、桌面本地文件夹。默认关闭，无账号。

## 4. Electron IPC 接口清单（阶段二实现后的实际形态）

`window.gtd`（contextBridge，preload 白名单事件通道）：

- **invoke（已实现）**：`command(op, payload)`（唯一写入口；主进程 dispatch core 命令表，命令白名单类型级穷举 CommandMap，DB 调用经 promise 链串行化）、`query(sql, params)`（主进程校验：单条 SELECT/WITH、禁多语句）、`window/show|hide|toggle|minimizeToTray`、`app/getInfo`、`app/quit`、`shortcuts/register(accelerator, actionId)`、`notify({title, body, taskId})`、`dialog/open|save`、`fs/readFile|writeFile|listDir`、`sync/setFolderRoot`
- **fs 通道安全**：路径白名单 = 用户经 dialog 选定的目录/文件 + `sync:setFolderRoot` 注册的同步根；越界路径一律拒绝。
- **event（main → renderer）**：`command/applied`（主进程侧变更广播，同步用）、`tray/quick-add`、`shortcut/triggered`、`notification/click`、`menu/action`、`window/focusChange`
- 原生能力（阶段三）：托盘（透明底 PNG + templateImage）、globalShortcut（默认 `CmdOrCtrl+Shift+Space`，will-quit `unregisterAll()`）、Notification 点击回调、菜单（role+accelerator）、dialog/fs。

> 原 v7 方案的 `bootstrap()` 独立通道被简化：渲染进程 bootstrap 经 `query` 五路并行只读查询完成（loadBootstrapData），少一条 IPC 通道，语义不变。

## 5. 响应式与可访问性（ui-ux-pro-max）

断点 375/768/1024/1440（`packages/ui/src/hooks/useBreakpoint.ts`）：<768 底部 Tab（≤5 项）；≥768 侧栏；≥1024 侧栏+双栏；≥1440 Timeline 可选。优先级：Accessibility → Touch（≥44×44px、间距≥8px）→ Performance → Layout → Typography/Color（正文≥16px、对比度≥4.5:1，亮暗分别校准）→ Animation（200–300ms、reduced-motion）。图标按钮一律 accessibilityLabel；交付前跑 pro-rules.md Pre-Delivery Checklist。

## 6. 阶段一硬验收结果（2026-10-24 实测）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| ① | Bun 下 `expo export --platform web`（含最小路由+fetch 模块） | ✅ PASS | 787 模块打包成功，dist/ 生成，static rendering 未触发已知 Bug |
| ② | Electron 加载静态产物 + app:// SPA fallback + 路由刷新 | ✅ PASS | `bun run smoke:desktop` → `SMOKE PASS: index 渲染 ✓ 路由刷新(fallback) ✓ 静态资源 ✓` |
| ③ | better-sqlite3 13.0.3 N-API 预编译在 apps/desktop 上下文全流程 | ✅ PASS | `bun run verify:sqlite` → resolve 至 hoisted 根 `node_modules`、N-API 加载、WAL、immediate 写、读、close 全过；SQLite 3.53.4；node:sqlite 备选分支未触发 |
| ④ | bun pm trust 完整清单 | ✅ 0 个被拦截 | 见下文「Bun 结论」 |
| ⑤ | payload zod schema + structuredClone 测试 | ✅ PASS | 11/11（含"函数不可克隆"守护用例） |
| 附加 | 全仓 strict tsc | ✅ 0 错误 | core / ui / desktop / mobile 四包 `tsc --noEmit` 通过 |
| 附加 | Expo dev 启动 | ✅ PASS | Metro 首页 HTTP 200、web bundle HTTP 200 |

### SQLite 驱动选型结论（关闭）

**better-sqlite3 13.0.3 定为桌面端驱动。** v13 首个 N-API 版本，8 平台预编译（darwin/linux/linuxmusl/win32 × x64/arm64）随 npm 包携带（`node_modules/better-sqlite3/prebuilds/`），同一 `.node` 二进制跨 Node/Electron ABI 工作，无需 @electron/rebuild 或源码编译，与 Electron 43.8.3 实测兼容。
**node:sqlite 备选未触发。** 若未来触发（如 better-sqlite3 预编译缺失），按方案 v7 §6.4 四项检查执行：查 Electron release notes 的 `require('node:sqlite')` 修复历史 → 主进程加载 + DatabaseSync CRUD → 记录 Node 版本对应的稳定性等级（当前 1.2 RC；Node 26 起 `DatabaseSync/StatementSync` 更名 `Database/Statement`）→ 按主进程打包方式选 external（Vite→rollupOptions.external；esbuild→external；无 bundler 无需配置）。

### Bun 结论（实测）

- **hoisted 生效**：`bunfig.toml` 先于首次 install 写入 `[install] linker="hoisted"`；实测布局为扁平（react/react-native/better-sqlite3 在根 `node_modules`，workspace 包经 `node_modules/@gtd/*` 链接）。
- **configVersion=1 与预期差异的说明**：Bun 1.4.4 对 workspace 项目固定写 `configVersion: 1`；该字段决定"默认 linker"（v1 默认 isolated），而 bunfig 的显式 `linker="hoisted"` 覆盖默认值——已用扁平布局实证。删除 lockfile 重新生成不会得到 `configVersion: 0`，因此原验收项"确认 configVersion=0"在 Bun 1.4.4 上的等价检查为：bunfig 显式 hoisted + 扁平布局验证（两者均通过）。
- **bun pm trust 清单：空**。`bun pm untrusted` = 0。原因：electron 43 已改为懒下载（包体无 install 脚本，首次运行时下载二进制）；better-sqlite3 v13 无安装脚本（预编译随包）；esbuild 走平台二进制子包（@esbuild/win32-x64）。无需任何 `bun pm trust` 操作。
- electron 二进制下载走 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。

## 7. 阶段二结果（2026-10-24 实测）

| 项 | 结果 | 证据 |
|---|---|---|
| core 命令层（真实 better-sqlite3 集成测试） | ✅ 40/40 | `bun test packages/core apps/desktop/tests`：create/update/complete（含重复推进）/softDelete/context 幂等/find-or-create/bootstrap 派生 |
| 全仓 strict tsc | ✅ 0 错误 | core / ui / desktop / mobile 四包 |
| Electron 端到端（渲染进程→IPC→命令→SQLite→查询回读） | ✅ SMOKE PASS | `bun run smoke:desktop` → `index 渲染 ✓ 路由刷新 ✓ 静态资源 ✓ 命令E2E(创建+查询) ✓`（种子数据经真实命令链路写入并被列表渲染） |
| Android 模拟器 | ⚠️ 受阻 | 本机无 Android SDK/adb/emulator/Java；安装整套 SDK 超出阶段范围。移动端逻辑由同一命令层集成测试 + 同一 UI 的 web 渲染背书；未验证增量 = expo-sqlite 绑定与原生渲染细节 |

阶段二关键实现与教训：
- **命令架构落地**：`executeCommand(executor, op, payload, ctx)` 在 core 内包 immediate 事务；桌面主进程经 `enqueueDb` promise 链串行化全部 DB 触达（同连接禁并发事务）；移动端 expo-sqlite 实现同一端口。
- **快照稳定性**：GTD 选择器返回派生数组，zustand v5 + useSyncExternalStore 要求 getSnapshot 缓存——`useAppStore` 内部统一套 `useShallow`，否则 React 无限循环白屏（冒烟阶段实测踩到，已修复并固化在 ui 绑定层）。
- **zustand 导入路径**：`useStore` 在 `zustand` 主入口，`useShallow` 在 `zustand/react/shallow`。
- **Metro 与 wasm**：expo-sqlite 的 web 实现会 import `.wasm`，`assetExts` 必须追加 `"wasm"`（metro.config.js），否则 expo export 解析失败——即使运行时（Electron）走 IPC 路径从不触碰它。
- **typedRoutes 已移除**：动态路由字符串（`/task/${id}`）与其类型冲突，收益不抵摩擦。
- **首次运行种子**：kv 标记幂等；经真实命令链路写入（同时充当启动自检），桌面/移动一致。
- 纯浏览器模式明确不支持（提示需在桌面/移动端运行）。

## 8. 阶段三结果（2026-10-24 实测）

| 项 | 结果 | 证据 |
|---|---|---|
| 同步合并规则单测（revision 优先 + 时钟偏差） | ✅ | 时钟快 1h 但 revision 低 → 仍败；并列比 updatedAt；墓碑参与比较；编辑击败墓碑=复活（文档化） |
| 双设备同步收敛（真实 SQLite + 内存 provider） | ✅ | 创建/并发编辑/删除传播/不动点（再同步 0 变更） |
| 批量应用（每批独立 immediate 事务） | ✅ | 2000 条 300/批 → 7 批（6×300 + 1×200），批间显式释放 |
| 文件夹 provider（真实 fs 往返） | ✅ | 双设备经临时目录收敛 |
| WebDAV provider（本地 HTTP 模拟 PROPFIND/MKCOL/PUT/GET） | ✅ | 往返收敛 |
| 到期通知扫描（kv 去重 + 上限 5） | ✅ | 今天/逾期入选、done 排除、dueAt 变化重新提醒 |
| Electron 原生能力 | ✅ SMOKE PASS | 托盘（透明底 PNG，关闭键=最小化到托盘，菜单含快速添加/显示隐藏/退出）、应用菜单（新建/快速收集/立即同步/每周回顾 + role 菜单）、CmdOrCtrl+Shift+Space 全局快捷键（will-quit unregisterAll）、Notification 点击回传 |
| 文件夹同步双设备 E2E（冒烟内、真实临时目录） | ✅ | `文件夹同步双设备E2E ✓`：主库 + 内存第二库经 provider 收敛，跨设备任务验证 |
| 全仓 tsc + 测试 | ✅ | 四包 0 错误；57/57（含 sync/merge/due-scan/provider） |

阶段三要点：
- `sync.applyRemote`/`import.merge` 共用一条合并路径（coerce 安全转换 → mergeOne → INSERT OR REPLACE 保原 revision）；SyncService 按 200–500 条/批分块调用，每批一个独立 immediate 事务。
- 同步文件布局 `devices/<deviceId>/{manifest.json, records.json}`，三种 provider 共用；同步 = 交换 manifest → revision 差异拉取 → 分批应用 → 回写自身快照。
- 到期通知：渲染进程 60s 扫描 store（pickDueNotifications），kv `notified.<taskId>:<dueAt>` 去重；desktop 经 IPC Notification（点击回传跳详情）；native 经 expo-notifications（权限失败静默降级）。
- 快速添加/菜单/托盘/通知点击 → 事件桥（tray:quick-add / menu:action / notification:click / shortcut:triggered）统一路由跳转。

## 9. 阶段四结果（2026-10-24 实测）

| 项 | 结果 | 说明 |
|---|---|---|
| 日历视图 | ✅ | 月历网格 + 按日计数徽标 + 点选日列出任务（只读） |
| 看板视图 | ✅ | GTD 四状态分列（收集箱/下一步/等待中/将来也许），点卡片进详情理清 |
| Timeline（≥1440 只读） | ✅ | 逾期分组 + 14 天窗口按日分组，时刻精确显示（默认 18:00 仅日期不显示时刻） |
| 视图切换 | ✅ | 收集箱：列表/看板；今天：列表/日历/Timeline（Timeline 项 <1440 自动禁用）——分段控件 ≥44px + 焦点环 |
| 每周回顾向导 | ✅ | 六步向导（收集箱→项目→日程→等待中→将来也许→完成），`buildReviewSummary` 纯函数供数，完成写 `review.lastAt`；"更多"页入口 + 菜单事件接线 |
| 专注视图分区 | ✅ | 拆分"已选中的下一步行动"与"今日到期"两区 |
| electron-builder 打包 | ✅ | `--dir` 验证通过：`release/win-unpacked/GTD 清单.exe`（electron 43.8.3，npmRebuild 跳过，better-sqlite3 `.node` 随 asar 解包，asar 完整性更新）；NSIS/DMG/AppImage 配置就绪 |
| 自动更新基础项 | ✅ | electron-updater 依赖 + autoUpdater 骨架（`GTD_UPDATE_URL` 环境变量启用，未配置时跳过）；macOS entitlements plist 就位，签名/公证在 yml 中留有注释位 |
| Pre-Delivery Checklist | ✅ | 见下 |
| 中英双语与本地化（评审后追加） | ✅ | ui 包 i18n 模块（zh/en 词典 + zustand vanilla 语言 store + useT hook，{n} 参数插值，系统语言探测）；全部界面文案/空态/a11y 标签/通知标题接入；桌面菜单与托盘按 kv.lang 构建（角色菜单显式中文标签），渲染进程 settings.set lang → 主进程即时重建；"更多"页中文/English 切换器持久化；冒烟新增断言 `菜单双语切换 ✓`（zh↔en 菜单标签实测变化）；打包产物重新构建并实机启动验证（4 进程） |

**ui-ux-pro-max Pre-Delivery Checklist 核对**：
- 触控目标：可交互 Chip 由 28px 提升至 ≥44px；全部按钮 ≥44px；按压反馈为透明度（无布局位移）。
- 焦点可见：web 端全部 Pressable 经 `useFocusStyle` 输出 ':focus' 外描边（RNW 伪类），native 忽略。
- 图标/emoji：未使用 emoji 作结构图标；Timeline 的 ↻ 为文本符号（重复标记），属内容字符。
- 对比度：亮暗两套 token 主文本 ≥15:1、次级 ≥7:1、primary 用于文字时 ≥4.5:1。
- 375px：无固定像素页宽（TwoPane 列表 pane maxWidth 480 + flex；看板列为组件内部定宽，横向滚动）；无横向滚动（页面级）；viewport meta 未禁缩放。
- reduced-motion：过渡仅 opacity（按压态），无位移动画；未引入超过 300ms 的动效。
- 已知残留：真实设备上的横屏/大字号/Dynamic Type 人工走查需在模拟器/真机进行（本机 iOS 受限）；看板列内拖拽跨列留待后续（当前经详情页流转状态）。

## 10. 目录与数据流（概览）

```
apps/mobile（Expo 通用应用：ios/android/web）──export:web──▶ apps/mobile/dist
                                                              │ sync-renderer
                                                              ▼
apps/desktop（Electron 壳）──app://gtd/──▶ renderer/（静态产物 + SPA fallback）
      │ 主进程：better-sqlite3 + core 命令表
      ▼ IPC window.gtd
packages/ui（唯一一套 UI 组件）──▶ apps/mobile/src/app（路由薄壳）
packages/core（模型/命令表/同步/存储端口）──▶ 双端共用
```

## 11. 已知问题 / 备忘

- 本机 8081 端口被其他进程占用，dev server 用 `--port 8090` 起动。
- iOS 端无法在 Windows 上实测，靠 strict tsc + 同构代码保障；真机验证需 macOS。
- Android 模拟器验证需先安装 Android SDK（本机缺失）；`bun run dev:mobile` + Expo Go 即可验证。
- 阶段三待办：托盘/快捷键/通知/菜单、同步（WebDAV/自托管/文件夹）与合并测试、桌面右键菜单与快捷键增强。
- 阶段四待办：electron-builder 打包（NSIS/DMG/AppImage）、macOS 签名 + electron-updater、托盘图标资产、日历/看板/Timeline 视图、每周回顾向导、专注视图打磨。

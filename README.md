# GTD 清单

本地优先（local-first）的 GTD 任务清单应用：一套 UI，四端运行 —— Windows / macOS / Linux（Electron 壳）、Android / iOS（Expo）。数据默认留在设备上，无账号即可使用；同步为可选增强（WebDAV / 自托管 / 桌面本地文件夹）。

架构与阶段验收详见 [docs/architecture.md](docs/architecture.md)。

## 功能（v0.10.0）

**收集与理清**：快速添加（自然语言：`@情境` `#项目` `+标签` `!!!优先级` `明天/周五/3天后` `每天/每周一三/双周/每月最后工作日/每隔3天/每工作日/完成后3天/重复5次` `>等待人`）、收集箱 → 下一步/等待中/将来也许的状态流转、软删除与**撤销**。

**组织**：项目（顺序/并行、**区域分组**、section 分组、下一步行动高亮、进度）、情境（@电脑/@电话/@外出）与**标签**（`+标签` 快捷输入、详情页编辑、筛选）筛选、清单子项、附件（桌面端文件对话框 / **移动端文件选择器**）、星标选入专注、**Markdown 笔记渲染**。

**视图**：列表、看板（四状态分列）、日历（月历 + 按日任务）、Timeline（≥1440，只读）、**搜索 + 情境 + 标签 + 只看逾期**筛选、**保存的筛选**（一键应用/长按删除）、**列表内拖拽排序**（拖动把手）、**移动端滑动操作**（左滑完成 / 右滑延后到明天）、**批量操作**（长按进入多选：完成/删除/移动状态）、手动排序（上移/下移）。

**命令面板**：`Ctrl/Cmd+K` 模糊搜索任务与项目，回车直达或直接新建任务（桌面菜单/快捷键 + 移动端通用）。

**专注**：番茄钟（25 分钟）+ 已选中行动 + 今日到期。

**回顾**：六步向导（收集箱 → 项目 → 日程 → 等待中 → 将来也许 → 完成），含 8 周完成趋势、长期未推进项目提示。

**桌面增强**：系统托盘、全局快捷键 `Ctrl+Shift+Space`、菜单快捷键（新建 `Ctrl+N` / **命令面板 `Ctrl+K`** / 快速收集 `Ctrl+Shift+K` / 搜索 `Ctrl+F` / 立即同步 `Ctrl+Shift+S` / 每周回顾 `Ctrl+Shift+R` / 立即备份 `Ctrl+Shift+B`）、原生通知、中英双语菜单、原生文件导入导出。

**数据**：SQLite 本地存储、可选同步（WebDAV / 自托管 / 本地文件夹 / **S3 兼容**，revision 优先合并 + 墓碑）、同步冲突日志、**每日自动本地备份（保留 7 份，可一键恢复）+ 云端备份**、密码 `safeStorage`（DPAPI/Keychain）加密、内置霞鹜文楷字体 + 日夜主题跟随系统。

**入口**：深层链接 `gtd://add?title=买牛奶` 一键捕获。

## 同步接入指南

支持任何 WebDAV 服务和 S3 兼容存储。坚果云/群晖/Nextcloud 开箱即用，百度网盘/阿里云盘可通过 [Alist](https://alist.nn.ci) 桥接。

详见 [docs/sync-providers.md](docs/sync-providers.md)。

## 结构

- `packages/core` — 数据模型、命令表、quick-add 解析、重复规则、同步合并、存储端口（纯 TS，无 React/RN 依赖，可在 Electron 主进程运行）
- `packages/ui` — 跨平台组件（RN primitives；web 经 react-native-web）；平台差异仅存在于少量 `.web.tsx` / `.native.tsx`
- `apps/mobile` — Expo SDK 57 通用应用（ios / android / web 三目标；web 产物即桌面渲染层）
- `apps/desktop` — Electron 壳（窗口/托盘/快捷键/通知/菜单/dialog/fs + SQLite 命令分发），零 GTD 逻辑

## ## 下载安装（GitHub Releases）

推送 `v*` 标签后，GitHub Actions 自动构建并发布到 [Releases](../../releases)：

- **Android**：`GTD-v*.*.*-android.apk` —— **签名 release 包**（v0.2.0 起）。⚠️ 曾安装过 v0.1.0 的 debug 包请先卸载（签名不同无法覆盖安装）；安装时允许"未知来源"。
- **Windows**：NSIS 安装器（`GTD.Setup.*.exe`）与便携版
- **macOS**：未签名 dmg（首次打开：右键 → 打开；自动更新需签名后启用）
- **Linux**：AppImage

发布新版本：`git tag v0.2.0 && git push origin v0.2.0`。

### Android 签名说明

签名密钥库 `apps/mobile/keys/gtd-release.p12` 随私有仓库保存（保证跨构建签名稳定、可平滑升级）；密码存 GitHub Secrets（`ANDROID_KEYSTORE_PASSWORD`），本地重置密码见 `scripts/gen-android-keystore.mjs`（重新生成会使已装用户无法覆盖升级，慎用）。仓库转公开前请评估是否迁移密钥管理。

## 常用命令（根目录）

```bash
bun install                        # 安装（electron 二进制建议先 export ELECTRON_MIRROR）
bun run dev:mobile                 # Expo dev server
bun run dev:web                    # Expo dev server（web）
bun run export:web                 # expo export --platform web（阶段一硬验收①）
bun run smoke:desktop              # Electron 全链路冒烟（渲染/E2E/托盘菜单/同步）
bun run verify:sqlite              # better-sqlite3 N-API 全流程验证（硬验收③）
bun run test                       # core 单测 + better-sqlite3 集成/同步测试
```

桌面开发态：先 `bun run dev:web`（Metro，本机默认端口被占用时改用 `--port 8090`），再 `cd apps/desktop && GTD_DEV_URL=http://localhost:8090 bun run dev`。

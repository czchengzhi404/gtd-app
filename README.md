# GTD 清单

本地优先（local-first）的 GTD 任务清单应用：一套 UI，四端运行 —— Windows / macOS / Linux（Electron 壳）、Android / iOS（Expo）。数据默认留在设备上，无账号即可使用；同步为可选增强（WebDAV / 自托管 / 桌面本地文件夹）。

架构与阶段验收详见 [docs/architecture.md](docs/architecture.md)；**全功能技术文档（数据模型/命令架构/功能规格/同步/安全/发布）见 [docs/technical-reference.md](docs/technical-reference.md)**。

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

## 下载安装（GitHub Releases）

推送 `v*` 标签后，GitHub Actions 自动构建并发布到 [Releases](../../releases)：

### Android（4 个包，按机型选）

| 文件 | 适用 |
|---|---|
| `GTD-v*-arm64-v8a.apk` | **绝大多数现代手机**（2016 年后大概率是这个） |
| `GTD-v*-armeabi-v7a.apk` | 老旧 32 位手机 |
| `GTD-v*-x86_64.apk` | x86 模拟器 / 部分平板 |
| `GTD-v*-universal.apk` | 不确定就选这个（体积更大，含全部架构） |

- 全部为**签名 release 包**；安装时允许"未知来源"。
- 系统要求：Android 7.0（API 24）及以上。

### 桌面端

- **Windows**：`*-setup-x64.exe`（Intel/AMD）、`*-setup-arm64.exe`（Surface/骁龙笔记本）；NSIS 安装器
- **macOS**：`*.*.dmg`（Intel）与 `*-arm64.dmg`（Apple Silicon）；未签名（首次打开：右键 → 打开）
- **Linux**：`*-x86_64.AppImage` 与 `*-arm64.AppImage`
- 系统要求：Windows 10+、macOS 11+、主流发行版（glibc 2.31+）

### iOS（未签名侧载包，无 Apple 开发者账号的现实方案）

| 文件 | 用途 |
|---|---|
| `GTD-v*-ios-unsigned.ipa` | 设备包（arm64）：TrollStore 直接装（iOS 14–16.6.1 / 17.0）；或用 AltStore / Sideloadly 以个人 Apple ID 重签（7 天有效期，可续） |
| `GTD-v*-ios-simulator.zip` | iOS 模拟器包：解压拖入 Xcode Simulator |

- 未签名 IPA **无法**在普通设备直接安装——这是苹果签名机制决定的；需要常规安装/上架需 Apple Developer（$99/年）签名。
- 系统要求：iOS 15.1+（React Native 0.86 下限）。

发布新版本：`git tag v0.12.0 && git push origin v0.12.0`。

### Android 签名说明

签名密钥**不入库**：CI 从 GitHub Secrets（`ANDROID_KEYSTORE_BASE64` + `ANDROID_KEYSTORE_PASSWORD`）构建时还原。当前密钥为 2026-10-31 本机离线自签的 RSA-4096（30 年有效期），取代早期随仓库保存的 RSA-2048——旧密钥仅存于本机归档（`release-local/keystore-archive/`），已从全部 git 历史抹除。**换钥影响**：v0.11.1 及之前的 APK 用旧签名，安装过旧版的话，升级到 v0.11.2+ 需卸载重装一次。

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

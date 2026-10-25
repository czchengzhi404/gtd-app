# GTD 清单

本地优先（local-first）的 GTD 任务清单应用：一套 UI，四端运行 —— Windows / macOS / Linux（Electron 壳）、Android / iOS（Expo）。数据默认留在设备上，无账号即可使用；同步为可选增强（WebDAV / 自托管 / 桌面本地文件夹）。

架构与阶段验收详见 [docs/architecture.md](docs/architecture.md)。

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

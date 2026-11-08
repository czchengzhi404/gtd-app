# v2.7.4 · 移动端导入 JSON 打通 + 更多页死代码清理

## 做了什么

两件事，一件用户能看见，一件看不见。

### 1. 移动端「从 JSON 导入（合并）」以前是坏的

数据页那个按钮在手机上点下去必然失败：它调用的是 `importFromFile()`，而函数体第一行就是
`gtd().dialog.open()` —— 那是 Electron 的桥，移动端根本没有这个对象。

也就是说**导出能用、导入不能用**：手机导出的 `gtd-*.json` 只能拿回桌面导入，手机自己读不回来。
这是「导出/导入往返」一直没跑通的真正原因，不是权限问题。

现在 `importFromFile()` 分平台：

| 平台 | 选文件方式 |
|---|---|
| 桌面 | `dialog.open()`（不变） |
| Android / iOS | `expo-document-picker` 系统文件选择器 → `readAsStringAsync` 读进内存 |

选中的文件**不复制进沙盒**——导出文件是只读一次的数据，复制只会在应用目录里留一份孤儿副本
（附件才需要复制，因为 `content://` 授权是临时的）。

合并逻辑抽成 `mergeImportedJson()`，两个平台共用：分批 300 条走 `import.merge`，
解析失败或没有 `records` 字段时给出明确提示（`more.status.importInvalid`），而不是抛一个
`Unexpected token` 给用户看。

### 2. 更多页删掉同步折叠块后留下的死代码

v2.7.3 删掉了重复的同步面板，但只删了 JSX，没删它背后的东西。清掉：

- 4 个 handler：`onSyncNow` / `onPickFolder` / `onSave` / `onTestConnection`
- 7 个 state：`busy` / `status` / `selectedPreset` / `testing` / `syncOpen` / `peers` / `syncLog`
- 2 个组件：`SegPill` / `Field`
- `SYNC_PRESETS` 常量 + `SyncPreset` 接口
- 9 个只剩 import 的引用（`getSyncConfig`、`getSqliteExecutor`、`runCommand`、`decryptSecret`、
  `listPeerDevices`、`pickSyncFolder`、`runManualSync`、`saveSyncConfig`、`testSyncConnection`）
- 7 个不再被引用的样式键

`more.tsx` 681 行 → 409 行。保留的只有一处真实读取：`resolveSyncConfig()` 用来在入口卡上
显示「已启用 / 未启用」。

## 顺带修的工具

`scripts/fetch-parallel.mjs`（从 ghproxy 镜像拉 APK 用）在这条链路上会反复 `ECONNRESET`。
这个脚本被改了三次，每次都是被上一版暴露的真问题逼出来的：

1. **未捕获异常杀进程**：`TLSSocket` 的错误先落在 socket 上，没有监听器时 Node 直接抛
   `uncaughtException`，已经下好的段全部作废 → 给 socket 和 response 都挂上 `error` / `aborted` 监听。
2. **段级落盘**：每段写成 `<out>.segN`，重跑时已完整的段直接跳过。
3. **段内续传 + 以磁盘为准**：请求被 RST 时数据可能已经写进文件但没被计入计数。
   如果还按旧计数从更早的偏移续传，文件会被写进重叠数据、长度与实际进度脱钩
   （实测段文件长度会从 11MB 掉回 6MB）。现在每轮重试都以磁盘实际长度为起点，超长则截断。
   改完这次 59.4MB 的包一次跑完，sha256 与 GitHub 给的 digest 一致。

`bench/push-commit-via-api.mjs` 加了可选的文件列表参数。本机 `origin/main` 跟踪引用常年停在
v2.5.0（网络不通没法 fetch），`git diff origin/main HEAD` 会把整个仓库算成改动，每次发布重传
几十个文件。现在显式列表让一次发布的成本等于真实改动量（这次 8 个文件）。

`bench/inspect-release.mjs` 新增：查看某 tag 的产物清单（含 GitHub 计算的 sha256 digest）。
`gh release view --jq` 在 PowerShell 里永远报 "accepts at most 1 arg(s)"，改用 `execFileSync`
传数组参数绕开 shell。

## 验证

在 Android 模拟器（Medium_Phone_API_37，x86_64，Android 17）上装 x86_64 包实测：

| 项 | 结果 |
|---|---|
| versionCode | 38 ✅ |
| 更多页只剩一个同步入口 | ✅ 顶部 `SYNC` 分组 + 一张 `Sync` 卡，「Last sync: 11/8/2026, 7:13:53 AM · disabled」，无预设标签、无折叠面板 |
| 导出 JSON（存到手机文件夹） | ✅ 走 SAF 选 `Documents` → `Saved: gtd-2026-11-08.json`，`/sdcard/Documents/` 里 4333 字节 |
| 导入 JSON（合并） | ✅ 拉起的确实是系统选择器（`com.google.android.documentsui/PickActivity`），选中该文件后回主界面提示 **Merged 8 records** |
| 导入取消 | ✅ 返回应用，无报错 |

脚本：`scripts/verify-274.mjs`（9/9）、`scripts/verify-274-roundtrip.mjs`（导出侧 10/12）、
`scripts/verify-274-import.mjs`（3/3）。截图在 `android-report/v274/`。

**未验证**：真机（只有模拟器）；iOS；桌面端的导入导出（这次没动它的代码路径）。

## 升级

- versionCode 37 → 38，同一签名

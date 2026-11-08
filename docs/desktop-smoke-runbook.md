# 在 DSH 会话里跑桌面端 smoke

桌面端 `bun --cwd apps/desktop smoke` 在这个环境里会连着踩两个坑，都不是代码问题。

## 坑 1：`ELECTRON_RUN_AS_NODE=1`

DSH 自己跑在 Electron 里，会话环境继承了 `ELECTRON_RUN_AS_NODE=1`。
Electron 二进制看到这个变量就退化成普通 Node，`require("electron").protocol` 是 `undefined`：

```
TypeError: Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')
    at node:electron/js2c/node_init
    at Module.executeUserEntryPoint [as runMain]
```

`runMain` 出现在栈里就是信号。跑之前清掉：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

## 坑 2：userData 在工作区外被沙箱拒写

默认 `app.getPath("userData")` = `%APPDATA%\@gtd\desktop`。沙箱下 Electron 子进程写那里会 `EPERM`，
SQLite 于是报 `SQLITE_CANTOPEN: unable to open database file`（而且停在 `journal_mode = WAL` 这一步，
因为 WAL 要在同目录建 `-wal` / `-shm`，不是 `new Database` 失败）。

判别方法：同一个库用 `node` 打开是好的，用 Electron 打开就 CANTOPEN —— 那就是权限，不是库坏了。

绕法：把 userData 指到工作区内。

```powershell
$prof = "E:\gtd清单\android-report\smoke-profile"
New-Item -ItemType Directory -Force $prof | Out-Null
& "E:\gtd清单\node_modules\electron\dist\electron.exe" . --smoke --no-sandbox "--user-data-dir=$prof"
```

## 坑 3：没有通知服务

检查进行到第 7 项会停：

```
SMOKE FAIL: 系统通知不支持
```

来自 `smoke.ts:108` 的 `Notification.isSupported()`。环境没有通知服务，跳不过去。

## 所以这条命令能验到哪一步

`smoke.ts` 的检查顺序是：

1. index 渲染
2. bundle 内路由刷新
3. 静态资源 HTTP 200
4. 命令链路 E2E（真的建一条任务并断言它出现在列表）
5. 菜单中英切换（顺带验证 i18n 键没缺）
6. 右键菜单 IPC 暴露
7. 托盘 / 快捷键 / **通知** ← 在这里挂
8. 文件夹同步双设备 E2E

前 6 项能跑通，第 7 项之后在本环境不可达。所以「桌面端 smoke 通过」这句话在这里只能说到第 6 项。

## 其它可跑的

```powershell
bun x tsc -p apps/desktop/tsconfig.json --noEmit   # 类型
bun --cwd apps/mobile export:web                    # 渲染层打包（more.tsx 等也要过这一关）
bun --cwd apps/desktop build                        # esbuild 主进程 + preload + 同步 renderer
```

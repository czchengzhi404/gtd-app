# 开发环境 runbook（DSH 会话）

这里记的不是产品逻辑，而是「在这个环境里跑验证时会踩的坑」。
分两块：桌面端 smoke、Android 模拟器。

---

# 一、桌面端 smoke

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

---

# 二、Android 模拟器上的三个环境噪声

跑 `scripts/verify-*.mjs` 时会反复遇到，不是产品问题，但会让断言莫名其妙地失败。

## 1. 另一个 app 抢前台

模拟器里装了 `com.dreamtrace.app`（梦迹），会周期性把前台抢走。表现是断言里
`topResumedActivity` 指向它，随后所有 `dumpUi()` 拿到的都是它家的界面。

处理：关键操作前先确认前台，必要时 force-stop 它再拉起自己。

```js
async function ensureApp() {
  const top = topActivity();
  if (/app\.gtd\.local/i.test(top)) return true;
  adb(["shell", "am force-stop com.dreamtrace.app"]);
  adb(["shell", "am start -n app.gtd.local/.MainActivity"]);
  await sleep(2600);
  return /app\.gtd\.local/i.test(topActivity());
}
```

## 2. 包状态会「坏掉」，需要重装

跑一段时间后会突然出现：

```
Error: Activity class {app.gtd.local/app.gtd.local.MainActivity} does not exist.
```

但 `pm list packages` 里还能看到 `package:app.gtd.local`。重装即可恢复：

```powershell
adb install -r "$env:TEMP\gtd-274-x86_64.apk"
```

## 3. 深链别拿 `/` 当路由

`go("/")` 会拼出 `gtd:///`，系统解析不了（`unable to resolve Intent`）。
根路由用显式组件启动：`am start -n app.gtd.local/.MainActivity`。
收件箱就是根路由（`(tabs)/index.tsx`），没有 `/inbox`。

## 4. 收软键盘：用 ESC，别用返回键

这一条害我卡了整整两轮验证（「导出单篇正文」和「正文版本历史」都挂在它上面）。

```powershell
adb shell input keyevent 111   # KEYCODE_ESCAPE —— 只关 IME
adb shell input keyevent 4     # KEYCODE_BACK —— 在 Stack 页面里等于「返回上一页」
```

`keyevent 4` 会把导入页/详情页整个退掉，然后后续所有断言都在错误的页面上跑，
报出来的失败完全不指向真实原因。

也不要点「空白处」收键盘：点常落在键盘上，之后的 `input swipe` 会被键盘当成
**滑行输入（glide typing）**，往当前焦点输入框里打字母——实测往 URL 里打出了 `" by g"`。

## 5. 详情页/表单的长页面：先滚到可见再点

`uiautomator dump` 只包含当前视口内的节点。按钮在折叠线以下时 `tapExact("Save")`
直接返回 `false`，看起来像「按钮不存在」，实际只是没滚到。

更坑的是**滚动过猛会越过目标**：从页面底部继续下滑，会跳过中间的 ACTIONS 行，
让「导出正文」看起来像没渲染。稳妥做法是先回顶部再向下找：

```js
async function scrollToTop(times = 6) {
  for (let i = 0; i < times; i += 1) {
    adb(["shell", "input swipe 540 800 540 2000 250"]);
    await sleep(350);
  }
}
```

## 6. 断言文案要以 i18n 的英文值为准

按中文猜英文会白白失败。踩过一次：以为「导出正文」的英文是 `Export note`，
实际 `detail.notesExport` 的英文是 **`Export body`** —— 按钮一直存在，只是断言找错词。

查法：

```powershell
Select-String -Path packages/ui/src/i18n/index.ts -Pattern '"detail\.notesExport"'
```



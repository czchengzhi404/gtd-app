# v2.7.31 · 功能矩阵清零：通知与设备列表都验证通过了

## 这一轮消掉最后两个未验证项

`docs/mobile-feature-matrix.md` 此前还剩 1 项 🟡（通知）和 1 项 ❌（设备列表）。
两项都已实测通过，矩阵现在全绿。

## ① 到期通知 7/7

`scripts/verify-notifications.mjs`

造一个 `NotifyProbe today`（行内实测带 `Today` 标记）→ 重启 App 跨过 60s
扫描周期 → 系统通知栏出现：

```
Task due | NotifyProbe | GTD 清单 | now
```

关键证据是通知的 `when` 时间戳变了：

```
重启前 when: 1794894916713
重启后 when: 1794895030884   ← 新投递
二次重启新 when: (无)          ← kv 去重生效，不重复打扰
```

排查中修掉的三个脚本坑（都会导致假阳性或假阴性）：

- `input text "A today"` 里空格被 shell 拆掉 → 必须写 `%s`，否则 `dueAt` 为空、永远不触发
- 断言写成「页面上某处有 Today」→ 种子任务「预约体检」自带 `Today 18:00`，
  无论有没有解析出日期都会通过。改成只看目标那一行自己的 meta
- 去重断言写成「数量没变多」→ 通知被系统清掉时数量会变少，也是假阳性。
  改成比较 `when` 集合的差集

## ② 设备列表 10/10（此前记的 ❌ 是过时记录）

`scripts/verify-peer-devices2.mjs`

先起 `bench/local-sync-server.mjs`（模拟器经 `10.0.2.2:8787` 访问），
App 里配置自托管 → `Sync now`：

```
Applied 0 · pushed 9 · devices 2
OTHER DEVICES | Device ke0001 | 1/1/1970, 12:00:00 AM
```

`devices 2` 与列表里的 `Device ke0001`（我伪造的第二台设备）证明**移动端同步页
一直有「其他设备」区块**，`sync.tsx:374` 的 `sync.peersTitle` + `listPeerDevices()`。
矩阵里那条「页面到 Save config 就结束、Devices 只在桌面端有」是 v2.7.4 时期的
过时记录，后来早已补上。**已更正，不是新功能。**

## 排查中发现的真实 UI 细节（不修，记录）

同步页的 **Server URL 输入框不会被 uiautomator 报告为节点**——`Server URL` 标签
在 y≈1275，`Username` 标签在 y≈1567，中间 250px 是空的。截图看那里**确实有输入框**
（占位文字 `https://dav.example.com/gtd/` 清晰可见），但 dump 里没有 EditText。

影响：任何依赖 `dumpUi()` 找输入框的自动化都会漏掉它。已写进 runbook，
脚本改用「标签中心 + 76px」的坐标偏移来点。

顺便修正一处假阳性：脚本原本先写伪造设备再读服务端目录，
于是「本机上传成功」这条永远为真。现在排除伪造目录后再判定。

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **519 项 / 44 文件全绿**
- 设备实测：通知 **7/7**、设备列表 **10/10**
- 功能矩阵：**无 🟡 / 无 ❌**

## 升级

- versionCode 64 → 65，同一签名
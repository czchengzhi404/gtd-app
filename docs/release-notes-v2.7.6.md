# v2.7.6 · 关于页加 GitHub 入口；启动时自动检测新版本

## 1. 关于页新增「开源」分区

两行外链：

- **GitHub 仓库** → `https://github.com/czchengzhi404/gtd-app`
- **问题反馈** → `https://github.com/czchengzhi404/gtd-app/issues`

走系统浏览器打开（`Linking.openURL`）。打不开时给红色提示，不静默失败。

顺手把散落的外链收进 `apps/mobile/src/platform/links.ts`：仓库地址、issues 地址、
releases 地址和 `openExternalUrl()` 都在这里，以后加链接不用再复制一份 `Linking.openURL`。

## 2. 启动时自动检测新版本

之前只有关于页一个手动「检查更新」按钮 —— 用户不点就永远不知道有新版本。

现在应用启动后会静默查一次 GitHub 最新 release：

- **一天只查一次**（`update.checkedAt` 记上次成功查询时间），不做无谓的 API 请求
- **失败一律静默**：离网、GitHub 抽风都不打扰，下次启动再试
- 有新版就把版本号和下载页写进 kv；「更多」页顶部出现一条横幅
  「有新版本 2.7.7 / 点这里去下载」，点进关于页有下载按钮
- 已是最新时会把之前残留的横幅清掉，不会一直挂着
- `readPendingUpdate()` 还会做一次防御比较：如果 kv 里记的版本不比当前版本新
  （比如用户刚手动装了新版），不提示

检测和提示是两件事：检测在启动时后台跑，UI 只读 kv。所以冷启动不会因为要等网络而卡住。

## 没有做的

- **不自动下载安装**：侧载 APK 装新版需要用户确认，静默安装会触发系统安全策略。
  这次只做到「告诉你、带你去下载页」。真·自更新（应用内下 APK 并拉起系统安装器）
  需要 `REQUEST_INSTALL_PACKAGES` 权限和 FileProvider，部分机型还会拦「安装未知应用」，
  失败路径多，留到以后单独做。
- 桌面端不用这套：它是 electron-updater，本来就静默下载安装。

## 验证

- `tsc -p apps/mobile` 通过
- `bun test` 465 项 / 38 文件全绿（含 i18n 中英键集一致性护栏）
- 设备验证情况见发布后补充

## 升级

- versionCode 39 → 40，同一签名

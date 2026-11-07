# v2.5.6 · 修复备份按钮被禁用

## 问题

v2.5.5 说「移动端本地备份可用」，但手机上「立即备份」按钮是**灰的**，点不动。

## 原因

改了两处，漏了第三处：

- ✅ `platform/desktop-actions.ts` 的 `backupNow` 加了移动端分支
- ✅ `platform/mobile-backup.ts` 实现了 checkpoint + 复制 + 轮转
- ❌ 但 `app/data.tsx` 的按钮还是 `disabled={busy || !isDesktop()}` —— UI 层把移动端挡在外面
- ❌ 还有一行静态提示「备份暂不可用（缺少文件访问权限）」，是上一版改文案时遗留的

## 修复

- 按钮：`disabled={busy || !isDesktop()}` → `disabled={busy}`
- 删掉那行静态提示

## 验证

装包后点「立即备份」应显示「已备份（共 1 份）」，且「恢复最近备份」从灰变可点。

## 说明

其余 `!isDesktop()` 保留不动，它们确实是桌面专属：
- 同步的「本地文件夹」模式（需要 FilesPort）
- 文件夹选择器

## 升级

- versionCode 27 → 28，同一签名

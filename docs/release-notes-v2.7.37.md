# v2.7.37 · 修复语言偏好重启后丢失

## 实际复现

在 v2.7.36 Android 正式包中：

1. 设置页选择「中文」；当前设置页和返回后的首屏会立即变成中文。
2. 结束进程并重新启动 App。
3. 首屏又变回 `Inbox / Now / Process` 英文。

所以之前的中文窄屏回归脚本在第一项就失败了。失败不是中文排版问题，而是语言偏好没有从持久化 KV 恢复到内存 i18n store。

## 根因

设置页的 `onLang()` 同时做了两件事：

- `setLang(next)`：只改当前进程的 vanilla store，立即刷新界面
- `runCommand("settings.set", { key: "lang", value: next })`：把偏好写入 SQLite KV

应用启动时 `bootstrapStore()` 确实把 KV 读进了 `appStore.kv`，但根布局从未调用 `setLang()` 把 `kv.lang` 恢复回 i18n store。新进程因此重新按模拟器系统 locale 探测为英文。

## 修复

新增 `restoreLang(value)`：只接受 `zh` / `en`，缺失或无效值保留首次启动的系统语言探测。

根布局在 `bootstrapStore()` 完成后调用：

```ts
restoreLang(appStore.getState().kv["lang"]);
```

这样启动后的导航、Stack 标题、设置页、Today 日期格式和首屏文案使用同一个持久化语言状态。

## 验证

- 新增 `packages/ui/src/__tests__/i18n-restore.test.ts`：保存中文、保存英文、缺失/非法值三项回归。
- core / ui / mobile 三包 TypeScript 检查通过。
- Bun：**530 pass / 0 fail，45 个文件**。
- Android x86_64 模拟器实测：v2.7.36 选中文后重启回到英文（复现）；v2.7.37 选中文、force-stop、冷启动后仍为中文。
- 中文窄屏回归 12/12 产品断言通过：320dp 中文首屏/完成/视角切换/全部列表搜索/任务可打开/快速添加完整标题/新任务入列/撤销条/撤销恢复；375dp 标题避开状态栏、切换位于安全区。
- 正式版 ARM64 SHA-256 `7fa25e04…adce15`，签名证书 `4a60608d…58dfe2700`（与历次正式版一致）。
- Tag `v2.7.37` → `dacb25f6…ee9`；Release 已公开发布（非草稿、非预发布），含 Android 4 分包、iOS 2 项与桌面 5 项，共 14 个资产。

## 范围

本次只修复语言偏好恢复，不改变翻译词典、布局断点、任务数据或同步协议。真实 ARM64 设备、iOS 和最大系统字体仍未验证。

## 版本

- versionName：2.7.37
- versionCode：71

# v2.7.39 · 日期格式与搜索记忆

v2.7.38 修掉了逻辑层的 6 个缺陷；这一版集中处理「看起来没坏、但用起来不对劲」的细节。

## 修复

- **中文界面出现美式时间**
  多处日期时间用 `toLocaleString()` / `toLocaleDateString()` 且不带 locale，格式跟随**设备区域**：
  英文系统的手机上，中文界面里「上次检查」「最近备份」「同步时间」「回收站删除时间」全是
  `11/23/2026, 2:55:28 PM`。部分 Hermes 构建即使传了 `zh-CN` 也会忽略参数。
  现在统一走 `@gtd/ui` 的 `formatDate / formatTime / formatDateTime`，由界面语言唯一决定：
  中文 `2026/11/23 14:05`，英文 `11/23/2026 2:05 PM`。共替换 11 处调用。
- **「最近搜索」重启即清空**
  它原本只是页面模块里的一个变量。分区名叫「最近搜索」，实际关掉 App 就没了。
  现在写入 `kv["search.recent"]`（本机数据、不参与同步），清空按钮也会同步落库。

## 新增测试

- `packages/ui/src/__tests__/format-date.test.ts`：中英两种语言、午夜/正午、带秒、非法时间共 8 条。

## 验证

- `bun test`：**555 pass / 0 fail**（47 文件）。
- core / ui / mobile 三包 `tsc --noEmit` 通过。
- 设备走查脚本 `scripts/verify-v2739.mjs`（模拟器实测截图与断言见 `android-report/`）。

## 版本

- versionName：2.7.39
- versionCode：73

# 闪退排查与内存结论（v2.5.1）

> 触发：v2.5.0 在小米 15 上「新建任务就闪退」。

## 0. 先说结论

| 判断 | 依据 |
|---|---|
| **最可能的元凶：`FlashList`** | v2.5.0 唯一新增的原生列表组件；官方明确「v2.x 只支持新架构，在旧架构上不会运行」。已**整体回退到 `FlatList`**。 |
| **放大了问题：没有错误边界** | 之前任何渲染期异常都会走 RN 默认全局 handler → Android 直接杀进程，表现为闪退、零信息。已加 `ErrorBoundary`。 |
| **内存膨胀点：`rowMetaById`** | v2.5.0 为**每一行**预生成 React 元素（2000 条任务 ≈ 2000 个元素树 ×2 组），常驻内存。已删除。 |
| **定时器竞态：`useNowMinute`** | 卸载时只清「当前那一个」timer，而回调内部会立刻再排一个，可能漏一个。已加 `cancelled` 标记。 |

## 1. 这次改了什么

### 1.1 回退 FlashList

`TaskList` 恢复为纯 `FlatList`，并移除 `@shopify/flash-list` 依赖。
FlatList 的参数保持不变（`initialNumToRender=14`、`windowSize=9`、`removeClippedSubviews`），与 v2.3.0 的稳定实现一致。

### 1.2 新增 `ErrorBoundary`

`packages/ui/src/components/ErrorBoundary.tsx`，在根布局包住整棵树。

效果：渲染期异常不再杀进程，而是显示「界面出错了 + 错误消息 + 重试」。
**用户能截图把真实原因发回来**——这是这次最有价值的部分，因为之前连错误消息都拿不到。

### 1.3 全局错误记录

`apps/mobile/src/platform/crash-log.ts`：

- 覆盖 `ErrorUtils.setGlobalHandler`：记录错误后**不退出**（默认实现会终止进程）；
- 最近一次错误写入 `kv["crash.last"]`（`{at, source, message, stack, componentStack}`）；
- 同时 `console.error("[crash]", ...)`，接 `adb logcat` 就能看到。

### 1.4 内存与定时器

- 删掉 `rowMetaById` / `rowActionsById` 的全量预生成；
- `TaskRow` 的 memo 不再比较 `meta` / `actions`（它们每帧新建，比较必然不等，等于让 memo 失效）；
- `useNowMinute` 加卸载标记，避免递归 `setTimeout` 漏清。

## 2. 内存泄漏审查结论

逐项检查了 v2.5.0 新增的所有「会持有引用」的地方：

| 位置 | 机制 | 结论 |
|---|---|---|
| `word-count.ts` 字数缓存 | `Map` + 上限 200 条、只缓存 ≤8KB | **有界**，最坏 ~1.6MB |
| `search.ts` 小写缓存 | `Map` + 上限 300 条、≤8KB | **有界**，最坏 ~2.4MB |
| `search.ts` 倒排索引 | `WeakMap`，key 是 `state.tasks` 对象 | **可回收**（store 换新对象即释放） |
| `getAllTasks` 数组缓存 | `WeakMap` | **可回收** |
| `rowMetaById`（已删） | `Map` 持有每行 React 元素 | **真膨胀，已移除** |
| `useNowMinute` | 递归 `setTimeout` | **已修竞态**；单 timer |
| `Pomodoro` | `setInterval` + cleanup | 正常 |
| `sync-scheduler` | store 订阅 + AppState 监听 + `dispose()` | 正常 |
| `bootstrap` | `setInterval` + cleanup 返回 | 正常 |
| `note_versions` | 每任务上限 20 条，写时裁剪 | **有界**（20 × 正文长度） |

**结论：没有发现无界增长的泄漏**；`rowMetaById` 是唯一的实际膨胀点，已删除。

## 3. 如果还闪退，怎么抓日志

### 3.1 用 adb（最有效）

```bash
# 手机开「开发者选项 → USB 调试」，连电脑
adb logcat -c                 # 清空旧日志
# 复现：新建一个任务
adb logcat -d > crash.txt     # 导出
```

在 `crash.txt` 里搜：

| 关键词 | 说明 |
|---|---|
| `FATAL EXCEPTION` | Java/Kotlin 崩溃（原生层） |
| `AndroidRuntime` | 同上，带完整堆栈 |
| `libc` / `SIGSEGV` / `SIGABRT` | NDK 层崩溃 |
| `[crash]` | 本应用记录的 JS 错误 |
| `ReactNativeJS` | JS 层的 `console.error` |

把 `FATAL EXCEPTION` 那段发我即可。

### 3.2 不接电脑

装 v2.5.1 后如果还崩，界面会显示「界面出错了」页而不是直接退出——把那一页截图发我。
这说明是 **JS 渲染错误**（而不是原生崩溃），截图里的消息足够定位。

### 3.3 区分两类

| 现象 | 类型 | 抓法 |
|---|---|---|
| 直接黑屏/回到桌面，无任何界面 | 原生崩溃 | `adb logcat` 的 `FATAL EXCEPTION` |
| 出现「界面出错了」页 | JS 渲染错误 | 截图 |
| 界面卡住然后闪退 | 可能 OOM | `adb logcat` 搜 `OutOfMemoryError` / `lowmemorykiller` |

## 4. 回滚选项

如果 v2.5.1 仍有问题，可以装回 v2.3.0（数据不丢：数据库迁移是**向前兼容**的，v7 表在旧版本里只是不被读取）：

- `GTD-v2.3.0-arm64-v8a.apk` 在 v2.3.0 的 release 里；
- 但注意：v2.5.0 写过的**正文历史**在旧版本里看不到（表还在，只是没入口）。

## 5. 为什么不是「数据损坏」

`note_versions` 是**新增表**，不修改任何既有表结构。迁移只有一条 `CREATE TABLE IF NOT EXISTS` + 一条 `CREATE INDEX IF NOT EXISTS`，是幂等的，不会破坏既有数据。

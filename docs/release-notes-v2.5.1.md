# v2.5.1 · 修复闪退

v2.5.0 在小米 15 上「新建任务就闪退」。这个版本针对该问题做了修复，并补上了崩溃可见性。

## 修复

| 项 | 处理 |
|---|---|
| **列表组件** | 回退 `FlashList` → `FlatList`（FlashList v2 只支持新架构，是 v2.5.0 唯一新增的原生列表组件） |
| **错误边界** | 新增 `ErrorBoundary`：渲染期异常不再直接杀进程，改为显示错误页 + 重试 |
| **全局错误记录** | 覆盖 `ErrorUtils.setGlobalHandler`，错误写入 `kv["crash.last"]` 并打到 logcat |
| **内存膨胀** | 删除「为每一行预生成 React 元素」的实现（2000 条任务 ≈ 4000 个常驻元素树） |
| **定时器** | 修复 `useNowMinute` 卸载时的递归 `setTimeout` 竞态 |
| **依赖** | 移除 `@shopify/flash-list` |

## 内存审查结论

逐项检查了 v2.5.0 新增的所有持有引用的地方（字数缓存、小写缓存、倒排索引、`getAllTasks` 缓存、`note_versions`、各定时器）：

- **所有缓存都有上限**（200/300 条、≤8KB）；
- **两个 WeakMap 可回收**（key 是 store 快照对象）；
- **唯一的实际膨胀点是行级元素预生成，已删除**。

没有发现无界增长的泄漏。

## 如果还闪退

v2.5.1 起，JS 层错误会显示「界面出错了」页而不是直接退出——**截图发我即可定位**。

如果是原生崩溃（直接回桌面、无任何界面），需要 `adb logcat`：

```bash
adb logcat -c
# 复现
adb logcat -d > crash.txt
```

在 `crash.txt` 里搜 `FATAL EXCEPTION`，把那段发我。详见 `docs/crash-diagnosis.md`。

## 升级

- versionCode 22 → 23，同一签名密钥，可覆盖安装，数据保留。
- 数据库无结构变更（v7 表在 v2.5.0 已建好）。

# v2.5.8 · 备份改用 VACUUM INTO

## 问题

v2.5.7 的备份仍然失败：

```
Call to function 'ExponentFileSystem.copyAsync' has been rejected.
→ java.io.FileNotFoundException: No resource found
```

`getInfoAsync` 说文件存在，`copyAsync` 却说找不到——说明 expo-file-system 的 URI 语义和 `getInfoAsync` 的探测结果不一致，靠猜路径不可靠。

## 修复

**改用 SQLite 自己的 `VACUUM INTO`**，和桌面端一致：

```sql
VACUUM INTO '/data/user/0/app.gtd.local/files/backups/gtd-2026-11-07T06-15-00.db'
```

优点：

- **不需要知道源库路径**——由 SQLite 内部读自己
- **自动处理 WAL**——VACUUM 会生成一致快照，不会漏掉未 checkpoint 的写入
- 输出的是一个干净、无碎片的数据库文件

`VACUUM INTO` 不可用时（旧版 SQLite 或路径限制）退回原来的「checkpoint + copyAsync」，并在错误消息里带上实际用的源路径。

## 已知限制

「恢复最近备份」仍走文件复制路径，可能和备份一样失败。恢复逻辑需要单独重做（用 `ATTACH + INSERT SELECT` 之类），本轮未改。**备份本身可用，恢复暂不保证。**

## 升级

- versionCode 29 → 30，同一签名

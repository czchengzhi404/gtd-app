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

## 实测结果

在 Android 17 x86_64 模拟器上逐项验证：

| 操作 | 结果 |
|---|---|
| 立即备份 | ✅ 显示「Backups: 1」 |
| 再备份一次 | ✅ 显示「Backups: 2」（轮转正常） |
| 恢复最近备份 | ✅ 确认框 → 「已恢复，请重启应用生效」 |
| 重启后数据 | ✅ 完好（Inbox 3 条待理清） |

恢复也走通了——之前担心的文件名路径问题在实际设备上没出现。

## 升级

- versionCode 29 → 30，同一签名

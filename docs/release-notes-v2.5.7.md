# v2.5.7 · 修复备份找不到数据库文件

## 问题

v2.5.6 备份按钮可点了，但点了报错：

```
Call to function 'ExponentFileSystem.copyAsync' has been rejected.
→ Caused by: java.io.FileNotFoundException: No resource found
```

## 原因

`PRAGMA database_list` 在 expo-sqlite 上返回的 `file` 字段是**相对路径**（`gtd.db`），直接拼上文档目录并不总是落在真实位置，`copyAsync` 于是找不到文件。

## 修复

改成**多候选探测**，逐个用 `getInfoAsync` 检查存在性，第一个命中的就用：

1. `PRAGMA database_list` 报告绝对路径 → 直接用
2. 报告相对路径 → 拼上 `Paths.document.uri`
3. 兜底：`<doc>/SQLite/gtd.db`、`<doc>/databases/gtd.db`、`<doc>/gtd.db`

失败时错误消息会列出**所有尝试过的路径**，方便反馈时定位。

## 升级

- versionCode 28 → 29，同一签名

# v2.5.3 · 修复写操作失效（新建/完成/保存正文丢失）

## 问题

在 Android 上会出现这些现象（界面不崩、也没有明显报错）：

- 新建任务点了没反应，输入框清空了但任务没进列表
- 完成任务后任务还在，也没有撤销条
- 正文编辑后点保存，内容消失
- 偶发：保存正文弹出 `Failed to save body: NativeDatabase.execSync has been rejected ... NullPointerException`

## 根因

`createExpoExecutor` 的 `transaction` 用的是 **expo-sqlite 的同步 API**（`db.execSync`），但事务体是 **async**：

```ts
db.execSync("BEGIN IMMEDIATE");
const result = await fn(executor);   // ← 这里让出事件循环
db.execSync("COMMIT");
```

`await` 期间事件循环会跑别的任务。只要两个命令并发，就会出现：

```
A: BEGIN IMMEDIATE
A: await ...          ← 让出
B: BEGIN IMMEDIATE    ← 已在事务中 → 报错/等锁
B: ROLLBACK           ← 没有活动事务 → SQLite 报错
```

原生层最终抛出 `NullPointerException`，而调用方（新建任务、保存正文）把异常 catch 成了 toast——**用户只看到"没反应"**。

启动时 seed 能成功，是因为它内部逐个 `await`，天然串行；一旦和后台任务（到期通知扫描、自动同步）或用户操作撞上就会丢写。

## 修复

在 `createExpoExecutor` 里加**事务串行队列**：用一条 Promise 链把事务排队，保证同一时刻只有一个事务在飞。

另外把 `ROLLBACK` 包进 `try/catch`——事务可能已被 SQLite 自动回滚，回滚失败不该掩盖原始错误。

## 验证方式

在 Android 17（x86_64 模拟器）上逐项复测：

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 快速添加任务 | 输入框清空但任务丢失 | 任务出现在列表 |
| 完成任务 | 任务不动、无撤销条 | 移入已完成、出现撤销条 |
| 正文编辑保存 | 内容消失 | 内容与字数保留 |

## 其他

- versionCode 24 → 25，同一签名，可覆盖安装
- 数据库无结构变更
- 桌面端（better-sqlite3）的事务是同步的，不受此问题影响

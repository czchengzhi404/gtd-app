# v2.6.0 · 数据库操作全串行 + 同步开关落地

## 一、启动崩溃的根因（重要）

从 v2.5.3 起就在和这个原生错误打交道：

```
Call to function 'NativeDatabase.execSync' has been rejected.
→ java.lang.NullPointerException
```

表现：

- 新建任务没反应、完成任务丢失、保存正文失败（v2.5.3 修了一部分）
- **偶发「Startup failed」，必须重启才能进**（v2.5.8 上稳定复现）

**根本原因**：expo-sqlite 的 API 是**同步**的（`execSync` / `getAllSync` / `runSync`），而 `executeCommand` 的 handler 是 **async**。只要 `await` 期间有另一个数据库调用插进来，原生层就会崩。

v2.5.3 只把 `transaction` 串行化了，**`query` 和 `run` 还在队列外面**——启动时 `migrate()` 正在事务里跑，同时 `getKvValue()` 在外面读，两个调用撞上 → NPE → 启动失败。

## 修复

**所有数据库操作**（`query` / `run` / `transaction`）都进入同一条 Promise 队列：

```ts
query:       (sql, p) => enqueue(() => db.getAllSync(sql, p))
run:         (sql, p) => enqueue(() => db.runSync(sql, p))
transaction: (fn, m) => enqueue(async () => { BEGIN; await fn(tx); COMMIT })
```

**关键细节**：事务内部传给 `fn` 的是**直连 executor**（`tx`），不再入队——否则事务会等自己，直接死锁。

## 二、同步开关不落库

同步页的开关只改本地 state，没写库，于是：

- 开关显示「同步已启用」
- 点「立即同步」提示「同步未启用」

修复：

- 开关切换**立即落库**（静默，不弹 toast）
- 点「立即同步」前若有未保存改动，**先自动保存再同步**

## 三、坚果云提醒

坚果云 WebDAV 不接受登录密码，必须在「账户信息 → 安全选项 → 添加应用」生成**应用密码**，填到密码框。

服务器地址：`https://dav.jianguoyun.com/dav/`（结尾 `/dav/` 不能少）

## 升级

- versionCode 31 → 32，同一签名
- 数据无结构变更

## 验证重点

1. 冷启动 5 次都能进主界面（不再 Startup failed）
2. 同步页：开开关 → 直接点「立即同步」，不该再提示「未启用」
3. 快速添加、完成、保存正文（回归 v2.5.3 的修复）

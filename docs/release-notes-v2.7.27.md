# v2.7.27 · 前置数据改为响应式派生 + store 定案日志

## 这一版改了两处

### 1. 去掉命令式快照（正确性修复）

`task/[id].tsx` 里前置相关的数据原本这样取：

```ts
const allTasks = Object.values(appStore.getState().tasks);   // ← 命令式快照
const selectedIds = task.blockedBy ?? [];
const prereqs = selectedIds.map(pid => allTasks.find(...))   // ← 快照里查标题
```

`appStore.getState()` 不是 hook，store 变了不会触发重算。改成：

```ts
const tasksById = useAppStore((s) => s.tasks);   // 响应式订阅整个 tasks 表
const allTasks = Object.values(tasksById);
const selectedIds = tasksById[task.id]?.blockedBy ?? task.blockedBy ?? [];
```

`useAppStore` 内部套 `useShallow`，`tasks` 对象里被更新的那条 task 引用变了就会重渲染。

### 2. 定案日志

`.then()` 里同时打印三样：
- `returned`：命令返回的 record 里的 `blockedBy`
- `inStore`：`appStore.getState().tasks[task.id].blockedBy`（命令执行后的实时 store 值）
- `selectedIdsWas`：本次渲染闭包捕获的旧值

这样一次 logcat 就能分清：
- `returned` 有值、`inStore` 有值、但页面没 chip → 纯渲染/派生问题
- `returned` 有值、`inStore` 为空 → `applyRecords` 没生效
- `returned` 为空 → handler / serialize 丢字段

## 前一版已确认的事实

`v2.7.26` 的 logcat：
```
[dep] add prereq task=01a1d96d-… prereq=01a1d96e-…
[dep] ok records=1
```
命令成功、无 fail。退出重进详情页仍无 chip，排除 stale 渲染。

新增 `task-update-blockedby.test.ts` 第二项测试覆盖
`runCommand → applyRecords → store`，**内存库里全链路通过**：
`result.records[0].blockedBy === [aId]` 且 `appStore.getState().tasks[bId].blockedBy === [aId]`。

所以问题只可能出在「store 到这个页面组件」这一段，本版的响应式订阅正是针对它。

## 验证

- `tsc`（core / ui / mobile）全通过
- `bun test` **519 项 / 44 文件全绿**（+1 项 runCommand→store 测试）
- 设备实测与 logcat：本版补充

## 升级

- versionCode 60 → 61，同一签名

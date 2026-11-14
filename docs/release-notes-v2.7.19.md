# v2.7.19 · 修好《纸与当下》首屏崩溃

## 崩溃现场

v2.7.18 装上后，首屏不是「现在该做的一件事」，而是整页错误屏：

```
界面出错了 / 这不是数据丢失……
Cannot read property 'some' of undefined
at InboxScreen
```

复现条件很具体：**设备里导入过旧版本导出的 JSON**。

## 根因（不是 `pickNextAction` 写错）

`packages/core/src/store/app-store.ts` 的 `applyRecords` 是**所有记录进 store 的唯一入口**，
但它写的是：

```ts
tasks[record.id] = record as Task;   // 纯类型断言，不做运行时补齐
```

`mergeImportedJson` → `runCommand("import.merge")` → `writeRawRecord` → `applyRecords`
这条路径会把导入文件里的原始对象直接塞进 store。老版导出的任务没有 `blockedBy`
（v2.7.18 才加的字段），于是 `pickNextAction` 里的 `task.blockedBy.some(...)` 就炸了。

`coerceTaggedRecords` 在导入时本该补齐，但 `import.merge` 走的是原样写入 +
`applyRecords`，绕过了它。

## 修法：在唯一入口归一化

```ts
function normalizeTask(record: Task): Task {
  return {
    ...record,
    blockedBy: Array.isArray(record.blockedBy) ? record.blockedBy : [],
    contextIds: Array.isArray(record.contextIds) ? record.contextIds : [],
    tags: Array.isArray(record.tags) ? record.tags : [],
    checklist: Array.isArray(record.checklist) ? record.checklist : [],
  };
}
```

为什么修这里而不是只在 `pickNextAction` 兜底：
- 以后**任何**新增字段、任何绕过 coerce 的路径（同步、模板实例化、未来的导入器）
  都从这同一个门进来，一处补齐就够了
- 消费点不需要各自记得「这个字段可能是 undefined」

同时在 `pickNextAction` 和 `NowView` 保留了轻量防御（旧对象当作「无前置」），
并在两个层次各补了单测：
- `next-action.test.ts`：缺 `blockedBy` 时不崩，当作无前置
- `apply-records-normalize.test.ts`：4 项，覆盖缺失补齐 / 已有值保留 / 其它数组字段

`bootstrapStore` 走 `taskFromRow`（`parseJson(undefined, [])` 已有兜底），本来是安全的。

## 验证

- `tsc`（core / ui / mobile）全通过
- `bun test` **503 项 / 42 文件全绿**（v2.7.18 是 499/41）
- 设备截图与首屏独立评审：本版补充

## 升级

- versionCode 52 → 53，同一签名

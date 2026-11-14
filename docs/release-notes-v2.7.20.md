# v2.7.20 · 修好 Hooks 顺序（首屏连续第二次崩溃）

## 又一版崩了，而且是不同的原因

v2.7.19 修好了 `blockedBy`，装上后首屏仍然落到错误屏，报错换成：

```
Rendered more hooks than during the previous render.
at InboxScreen
```

原因是我把新增的 `useMemo(() => pickNextAction(inbox, ...))` 放在了
`if (!loaded) return null;` **之后**：

```ts
if (!loaded) return null;              // ← 首帧在这里就返回
const filterActive = ...;
const showNow = ...;
const nowResult = useMemo(...);        // ← 加载后才执行的 hook
return (...)
```

首帧 `loaded=false` 时少调用一个 hook，加载完成后多调用一个 ——
React 的 Hooks 规则要求每次渲染调用**数量与顺序完全一致**，直接抛错。

修法：把 `useMemo` 挪到所有 early return 之前，与其它 hooks 排在一起。
复查了整个文件：36 处 hook 调用全部在 193 行的 early return 之前，顺序稳定。

## 为什么 tsc 和 503 项单测都没抓到

这是**运行时渲染期**错误：TypeScript 不检查条件调用 hook，
单测跑的是纯函数（`pickNextAction` / `applyRecords`），没人真正渲染这个组件。
只有装到设备上、走一遍冷启动才会暴露。

这也说明「截图评审」这一步不能省——它是这套流程里唯一能抓到这类问题的环节。

## 连续三版对照

| 版本 | 首屏 | 原因 |
|---|---|---|
| v2.7.18 | ❌ `Cannot read property 'some' of undefined` | `applyRecords` 用类型断言塞进缺 `blockedBy` 的旧记录 |
| v2.7.19 | ❌ `Rendered more hooks than during the previous render` | `useMemo` 放在 early return 之后 |
| **v2.7.20** | 待本版截图确认 | 两处都已修 |

前两版的发布说明都已加上 ⚠️ 标注，不藏。

## 修复清单

1. `packages/core/src/store/app-store.ts` — `normalizeTask()` 在唯一入口补齐数组字段（含 4 项单测）
2. `packages/core/src/features/next-action.ts` — `task.blockedBy ?? []` 轻量防御（含 1 项单测）
3. `packages/ui/src/components/NowView.tsx` — `(next.blockedBy ?? []).length`
4. `apps/mobile/src/app/(tabs)/index.tsx` — `nowResult` 的 `useMemo` 移到 early return 之前

## 验证

- `tsc`（core / ui / mobile）全通过
- `bun test` **503 项 / 42 文件全绿**
- 设备截图：本版补充

## 升级

- versionCode 53 → 54，同一签名

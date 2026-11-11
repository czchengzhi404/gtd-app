# v2.7.13 · 修掉「筛选到 0 条却说收集箱是空的」

## 这个 bug 怎么发现的

本来只是在补验「收集箱筛选」这个 🟡 项：打开漏斗 → 点 `Overdue only` → 看计数变化。
计数确实从 **3 → 0**，功能是对的。但关掉抽屉之后截图是这样的：

```
标题：  3 to process          ← 收集箱里还有 3 条
漏斗：  高亮 + 角标 1         ← 筛选仍然生效
列表：  Inbox is empty        ← 但显示「收集箱是空的」
```

三处互相矛盾。任务并没有消失，只是**没匹配上筛选条件**，可页面告诉用户「收集箱是空的」。
一个刚清空收集箱的用户会以为自己删掉的东西还在；反过来，一个筛错了条件的用户
会以为任务丢了。

## 改了什么

`filterActive` 这个变量早就有了（第 169 行），只是空态压根没用它。现在：

```tsx
emptyTitle={filterActive && inbox.length > 0 ? t("inbox.noMatchTitle") : t("inbox.emptyTitle")}
emptyHint={filterActive && inbox.length > 0 ? t("inbox.noMatchHint") : t("inbox.emptyHint")}
emptySuggestions={filterActive ? [] : suggestions}
```

- 真没任务 → 「收集箱是空的」+ 片段建议（不变）
- 有任务但没匹配 → 「**没有符合条件的任务**」/「收集箱里还有任务，只是没匹配上当前筛选。清掉筛选条件看看」
- 筛选生效时不再显示那排片段建议（点了会把筛选挤掉）

标题上的 `3 to process` 保持不变——它本来就是「收集箱总量」，不是「当前可见数」，
这是常见做法（筛选只影响列表）。

## 顺带补验完的两项

| 项 | 结果 |
|---|---|
| 语法速查弹层 | `?` 打开模态，8 条语法：`@`情境 / `#`项目 / `+`标签 / `!`优先级 / 日期 / 时刻 / 重复 / `>`等待，带 Close |
| 收集箱筛选/透视 | 底部抽屉 `Filters · 3 found` + 4 个条件；点 `Overdue only` → **3 → 0** |

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **489 项 / 40 文件全绿**
- `scripts/verify-syntax-filter.mjs` 12/13（唯一未过的是我写错的断言，见下）
- **空态修复设备复验（`scripts/verify-inbox-empty-state.mjs`，7/7 全过）**：
  - 筛选 `Overdue only` 后标题仍是 `3 to process`、漏斗角标 `1`
  - 空态显示 **`No tasks match`** /「收件箱里还有任务，只是没匹配上当前筛选」
  - 不再出现 `Inbox is empty`
  - 清掉筛选后 3 条任务重新出现

## 自动化脚本又踩的三个坑（已写进 runbook）

1. **`tapLabel` 要同时查 `text` 和 `desc`**：图标按钮只有 `contentDescription`，
   文字按钮只有 `text`。只查一个字段，另一半永远点不到。
2. **模态的 Close 按钮点不动**：坐标点得中但关不掉（疑似点在遮罩层），
   这类 RN 模态用返回键更可靠。
3. **`Set-Content -Encoding UTF8` 会把中文写成乱码**——第七次了，别用 PowerShell 改含中文的源码。

## 升级

- versionCode 46 → 47，同一签名

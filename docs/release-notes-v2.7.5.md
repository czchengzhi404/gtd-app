# v2.7.5 · 修掉每个二级页面的双层标题栏

## 问题

`数据与记录`、`设置`、`模板`、`导入`、`版本历史`、`素材库`、`最近操作`、`写作`
这 8 个页面，进去以后顶部是两层标题、两个返回箭头：

```
[← Data & records]        ← Stack 自带的 header
[‹ Data & records]        ← 页面里自绘的 PageHeader
```

根因是两套标题栏同时在渲染：`_layout.tsx` 里给这些路由设了 `title`，
所以 Stack 画一层；页面里又用 `PageHeader` 画了一层（带副标题、右侧操作区）。

`(tabs)/_layout.tsx` 早就为「收集箱 / 今天」处理过同样的问题（注释写着
「隐藏 tabs 自带标题避免双标题」），但 Stack 侧的这些页面一直没同步。

## 修法

沿用 tabs 已验证的那套：

1. `_layout.tsx` 里给这 8 个路由加 `headerShown: false` —— 只留页面自绘的 `PageHeader`
2. 页面里给 `PageHeader` 包一层 `<View style={{ paddingTop: insets.top }}>` ——
   Stack header 原本顺带承担了躲开状态栏的职责，隐藏后要自己补

顺带给 `history` / `materials` / `recent` / `writing` 补了返回按钮：
它们的 `PageHeader` 之前没传 `onBack`（因为返回箭头由 Stack 提供），
隐藏 Stack header 之后必须自己画，否则进得去出不来。

## 怎么发现的

这轮在做「大字体防御」验证：把系统字体缩放调到 1.3 / 1.5，逐页截图看会不会挤爆。
结果字体本身没问题（6 个页面 × 2 档全部正常，无截断无重叠），
反而在 1.5 倍的截图里一眼看到了那两行重复的标题。

## 验证

- `tsc -p apps/mobile` 通过
- `bun test` 465 项 / 38 文件全绿
- 大字体截图：`android-report/large-font/1.3-*.png`、`1.5-*.png`（6 页 × 2 档）
- **修复后的截图验证在发布后进行**（本轮先发布再装包看）

## 升级

- versionCode 38 → 39，同一签名

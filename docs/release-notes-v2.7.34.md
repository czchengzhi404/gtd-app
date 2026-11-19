# v2.7.34 · 首屏 `See all` 从蓝色改回赭石

## 问题

v2.7.33 的截图复核时发现：首屏底部的 `See all 4 →` 是**蓝色**
（`colors.info`），而整套界面只应有赭石一个强调色。

蓝色出现在这里特别扎眼，因为它紧挨着 `Done`（赭石实心块）——
一眼看过去像是两个不同系统的东西。

## 改法

```diff
- color={colors.info}
+ color={colors.primary}
```

文字与箭头两处都改。

为什么不改成灰色（`colors.textSecondary`）：那样它会更低调，但也会
沉进纸面、用户可能看不见这个入口。赭石文字不会和 `Done` 的实心块争视觉
重心（一个是实心块、一个是细字），同时守住「只有一个强调色」的纪律。

## 顺带核对：全项目还剩几处蓝色

`grep colors.info packages/ui/src/components/*.tsx` 只剩 **1 处**：

`StatTile.tsx:36` 的 `info: colors.info`。
那是统计瓦片的 `tone` 语义板（`default / primary / success / warning /
danger / info`），只有当调用方显式传 `tone="info"` 才生效，用于区分多个
数据类别。**属于合理用法，保留。**

## 验证

- `tsc`（ui）通过
- `bun test` **519 项 / 44 文件全绿**
- 设备截图与像素判定：待补

## 升级

- versionCode 67 → 68，同一签名
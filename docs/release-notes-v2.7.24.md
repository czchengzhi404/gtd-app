# v2.7.24 · 修好前置候选面板点不动

## 现象

v2.7.23 的「添加前置」面板能正常弹出、列出 6 个候选，但**点任何一项都只关闭面板，
前置没加上**。设备上重演两次（点 Alpha、点第一个候选「整理桌面」）结果一致，
说明不是坐标问题，是 `onSelect` 根本没被调用 —— 点击被 `Modal` 的全屏 `backdrop`
Pressable 吃掉了，走了 `onClose`。

`OptionSheet` 的结构：

```
<Modal>
  <Pressable backdrop onPress={onClose} />        ← 全屏 absolute
  <View sheetPos pointerEvents="box-none">        ← flex:1，自己不收触摸
    <View sheet>  ← 选项 Pressable 在这里
```

`box-none` 让 `sheetPos` 自己不接收触摸，但**子 View 的 pointerEvents 默认继承行为
在 RN 各版本并不完全一致**；实测这台设备（Android 17 / RN 0.86）上选项没有拿到事件。

## 修法

给 `sheet` 显式 `pointerEvents="auto"`，明确它自己接收触摸，
不依赖父级的 `box-none` 继承语义：

```tsx
<View accessibilityRole="menu" pointerEvents="auto" style={styles.sheet}>
```

不改布局、不改配色、不影响 backdrop 关闭（点空白仍走 `onClose`），
是最小风险的修正。

## 为什么之前没发现

`OptionSheet` 早前用在「批量移动 / 批量推迟」，但那些验证脚本只断言了
「入口能点开」，**没有断言选完之后状态真的变了**。这个组件的选择回调
一直是未验证的。这次 `verify-dependencies.mjs` 要求「chip 真的出现」，
才把漏洞逼出来。

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **517 项 / 43 文件全绿**
- 设备实测：本版补充（点候选 → chip 出现 → 首屏显示「另有 1 件在等前置」）

## 升级

- versionCode 57 → 58，同一签名

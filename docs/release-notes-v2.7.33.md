# v2.7.33 · 首屏视角切换：从纯图标改成带文字的胶囊

## 问题

首屏 header 右侧那个切换按钮原本只有一个图标：

```tsx
<IconButton icon={focusMode ? "list-outline" : "square-outline"} … />
```

两个具体问题：

1. **用户看不懂**。图标是 `list-outline` / `square-outline`，
   看着像「列表模式 / 卡片模式」（那是看板切换），而实际是
   「全部列表 ↔ 一张视角」。语义完全不匹配。
2. **它是首屏唯一的无文字动作**。同一屏里 `Process` / `Add` / `Done`
   都有文字，只有这个是个孤零零的图标——整页的视觉节奏在这里断掉。

## 改法

换成一颗带文字的胶囊（复用已有 `Chip`，`prefix={null}` 避免被加上 `@`）：

```tsx
<Chip
  label={focusMode ? t("now.viewAll") : t("now.viewOne")}   // 全部 / 一张
  prefix={null}
  a11yLabel={focusMode ? t("now.toggleAll") : t("now.toggleOne")}
  onPress={() => setFocusMode(focusMode ? "all" : "one")}
/>
```

新增两条短文案（中英）：

| key | zh | en |
|---|---|---|
| `now.viewAll` | 全部 | All |
| `now.viewOne` | 一张 | One |

## 顺带给 Chip 加了 `a11yLabel`

显示文本为了排版必须短（「全部」两个字），但读屏需要完整语义
（「切换到全部列表」）。原 `Chip` 把显示文本同时当无障碍标签，
这里会退化。

所以给 `ChipProps` 加了一个可选 `a11yLabel`：

```diff
- accessibilityLabel={interactiveLabel}
+ accessibilityLabel={a11yLabel ?? interactiveLabel}
```

不传时行为与之前完全一致，**不改动任何现有调用方**。
这也让依赖 `Switch to full list` 这个标签的验证脚本继续可用。

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **519 项 / 44 文件全绿**
- 设备截图待补：切到「一张」时应显示「全部」，切回列表应显示「一张」

## 升级

- versionCode 66 → 67，同一签名
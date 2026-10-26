# UI 设计系统（v0.3.0）

一套 UI 同时跑移动端（RN 原生渲染）与桌面端（react-native-web），平台差异只允许出现在 `*.web.tsx` / `*.native.tsx`。

## 1. 为什么重构

v0.2.x 之前，各组件各自写字号/间距/颜色字面量，出现两类问题：

1. **文本会撑爆布局**：Android 部分 ROM（OriginOS/HyperOS）系统字体或显示缩放调到最大时，文字变大把容器挤变形，视觉上"叠成一团"。
2. **视觉不成体系**：同类元素在不同页面字号/间距不一致。

v0.3.0 的做法是**用结构而非补丁解决**：把所有文本收敛到一个原语，字号行高写死在 token 里。

## 2. 唯一文本原语 `AppText`

`packages/ui/src/theme/AppText.tsx`。四重锁定：

| 机制 | 作用 |
|---|---|
| `allowFontScaling={false}` | 不随系统字体大小缩放 |
| `maxFontSizeMultiplier={1}` | 双保险（部分 ROM 只认这个） |
| 字号/行高来自 `type` 阶梯 | 容器高度可预测 |
| 默认 `numberOfLines=1` + 省略 | 长文本不挤占相邻元素 |

**纪律：全应用禁止直接使用 react-native 的 `<Text>`。** 原生层另有 `attachBaseContext` 里 `fontScale = 1.0` 兜底（CI 注入 MainActivity）。

## 3. Token

```ts
space:  0 / 2 / 4 / 8 / 12 / 16 / 20 / 24 / 32     // 8pt 栅格
radius: 6 / 10 / 14 / 20 / pill
type:   display 24/30  · title 18/24 · body 15/21 · label 13/18 · caption 11/15 · mono 14/21
hit:    min 44 · row 56 · nav 48 · button 46 · tabBar 62 · toolbar 52
```

颜色为语义 token（`canvas / surface / surfaceMuted / text / textSecondary / textTertiary /
primary / primaryMuted / onPrimary / border / danger / success / warning / overlay`），亮暗双套，正文对比度 ≥4.5:1。

## 4. 原语组件

`theme/primitives.tsx`：`Button`（primary/secondary/ghost/danger × md/sm）、`IconButton`、`Card`（可点/只读）、`Divider`、`Spinner`。

布局：`Screen`、`PageHeader`、`SectionHeader`、`SegmentedWrap`（`components/Screen.tsx`）。

## 5. 布局规则

- 内容列宽上限 **760**，宽屏居中——桌面端不会出现超长文本行。
- 列表：单卡片 + 细分隔线（`TaskList`），行高 ≥56。
- 行内元信息高度固定 20（优先级点、到期、情境标签），不参与行高计算。
- 行尾操作 `⋯` 打开**底部动作面板**（Modal），不再用绝对定位浮层（避免与相邻行重叠）。
- 导航：移动端底部 TabBar（图标 + 11px 标签），≥768 切换左侧栏，≥1024 列表/详情双栏；两者同源于 `NAV_ITEMS`。
- 空态不套卡片，保留留白；不使用 emoji 作图标（统一 Ionicons）。

## 6. 可访问性

- 触控目标 ≥44（多数为 46–56），可点元素带 `accessibilityRole` + `Label` + `State`。
- web 端 `useFocusStyle` 输出 `:focus` 描边，键盘可达。
- 动效 200–300ms，按压态仅改透明度，不做布局位移。

## 7. 目视验收

`bunx electron . --shot=390x844,<输出路径>,<路由>` 可离屏截图（窗口不显示、不抢焦点），
用于本地验证移动端布局与桌面端宽度表现。

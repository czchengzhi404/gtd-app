# v2.7.30 · 评审第 ② 条：列表页视觉与首屏统一

## 背景

两轮独立截图评审里，第 ② 条一直是「未改善」：

> 「全部」列表页仍是旧的视觉语言——搜索框是一只描边胶囊、任务行之间有逐行分隔线、
> 整块列表是一张带边线的白色圆角面板。而首屏已经换成无卡片的纸面。

第一轮我明确推迟了它（牵动 8 个页面），这一版处理。

## 改了什么

### 1. 搜索框：描边胶囊 → 纸面下划线

```diff
- height: 44, paddingHorizontal: space.md,
- borderRadius: radius.sm, borderWidth: 1,
+ height: 44, paddingHorizontal: space.xs,
+ borderBottomWidth: StyleSheet.hairlineWidth,
```

聚焦态从「整圈变赭石」改为「底边线变赭石」：

```diff
- backgroundColor: colors.surface,
- borderColor: focused ? colors.primary : colors.border,
+ borderBottomColor: focused ? colors.primary : colors.border,
```

理由：一张纸上的一行字不该被框起来。原设计的第二只胶囊把页面切成了几块白板。

### 2. 列表去掉逐行分隔线

```diff
- ItemSeparatorComponent={() => <Divider inset={space.lg} />}
+ ItemSeparatorComponent={carded ? () => <Divider inset={space.lg} /> : null}
```

行与行靠留白和字重区分，不再画线——和首屏队列一致。

### 3. 未改的部分（说明理由）

- **列表面板保留**：`surface` 与页面背景只差 8 个色阶
  （`#FFFDF9` vs `#F7F5F1`），几乎同色，拆掉没有视觉收益，反而丢掉
  `FlatList` 的裁切与圆角一致性
- **标题字号不动**：`TaskRow` 用 `body`、`NowView` 用 `hero` 是**刻意的层级差**
  （38px 主焦点 vs 列表行）。字体族都走同一个 `AppText`，不算不一致

## 验证：用像素分析，不问模型

截图描述模型对本轮问题连续 5 次返回同一段泛泛描述、完全没回答「有没有分隔线」。
改用 `bench/audit-list-visual.py` 直接量像素，这是确定性证据：

| 检查项 | 改前 | 改后 |
|---|---|---|
| 逐行分隔线（y=620..2000 全宽同色行扫描） | 有 | **0 条** |
| 搜索框边框（y=430..600 全宽线扫描） | 四边描边 | **仅 y=515/516 一条底边线** |
| 聚焦态线色 | 整圈赭石 | **`(194,153,126)` 赭石底边线** |
| 「今天」页搜索框 | 四边描边 | **y=423/424 底边线** |

「今天」页 `y=671` 那条是「Overdue only」筛选行的分隔线，属于分组语义，
不是逐行描边，保留。

## 影响面

`FilterBar` 只被 2 个页面使用（收件箱、今天），`TaskList` 的 `carded` 参数
无人传 `false`。改动只落在列表页，不影响详情/项目/矩阵。

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **519 项 / 44 文件全绿**
- 设备截图 `android-report/review2/`：`full-list` / `today-page` / `inbox-full` / `search-focused`
- 像素审计：`bench/audit-list-visual.py`、`bench/find-underline.py`

## 仍未解决

- 真机 arm64 未复核（仍是模拟器结论）
- 通知（矩阵唯一 🟡）
- `OptionSheet` 的批量移动/推迟**仍未端到端验过**：模拟器
  `input swipe` 长按被识别成点击，进不了多选模式。代码接线已确认正确
  （`TaskList.tsx:146` → `TaskRow onLongPress`，`delayLongPress={250}`），
  但缺一次真实触摸验证

## 升级

- versionCode 63 → 64，同一签名
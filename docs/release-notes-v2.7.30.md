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

## 补验完成：OptionSheet 批量回调（v2.7.30 之后，无代码改动）

此前三版都挂着「`OptionSheet` 的批量移动/推迟只验过入口能点开」。
这一轮销掉了，`scripts/verify-bulk-move.mjs` **6/6**：

```
PASS  全部列表里有可长按的任务行 — 6 行
PASS  长按进入多选模式 — 1 selected, Complete, Move to…, Defer to…, Delete
PASS  找到「Move to」按钮
PASS  OptionSheet 弹出 — Move to… | Next | Waiting | Someday | Inbox | Cancel
PASS  面板里定位到 Waiting
PASS  被移动的任务「BulkOne」已离开收件箱列表
      6 to process → 5 to process
```

**关键突破**：长按不能再用 `input swipe x y x y 800`——在这个模拟器上它会被
识别成**点击**，直接打开详情页，看起来就像「多选模式进不去」。
改用 `input motionevent DOWN / sleep / UP` 精确按住 800ms 才稳定触发
`delayLongPress={250}`。

**结论：`OptionSheet` 的选择回调从来没有问题。** v2.7.24（改 `pointerEvents`）
和 v2.7.25（改成内联展开）这两次针对它的修改，都是基于误判——真因是远端缺 schema。
v2.7.25 的内联展开本身是合理的产品选择（不弹层、同一张纸上完成），所以保留。

同时修掉一个测试自身的缺陷：批量操作后列表可能变空，
`!rows.includes(target)` 会恒为真、产出**假阳性 PASS**。
现在必须先断言 `rows.length > 0`。

两条经验都已写进 `docs/dev-env-runbook.md`（4b / 4c 节）。

## 升级

- versionCode 63 → 64，同一签名
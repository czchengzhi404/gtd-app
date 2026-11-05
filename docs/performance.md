# 性能优化记录

> 方法：**先测量、再改、再测**。所有数字来自 `bench/` 下的脚本，可复现。
> 对应版本：v2.5
> 基线环境：Windows / Bun 1.4.4 / 内存 SQLite（真机数据会不同，见 §5）

---

## 0. 结论先行

| 操作 | 优化前 | 优化后 | 提升 |
|---|---|---|---|
| **全库字数统计**（2000 任务 × 800 字） | **13.50 ms** | **0.08 ms** | **≈169×** |
| `collectLocalRecords`（800 任务 / 1600 附件） | 2.8 ms（**801 次查询**） | 1.5 ms（**1 次查询**） | 查询次数 801 → 1 |
| 今天视图（2000 条） | 0.08 ms | 0.07 ms | — |
| 素材库（2000 条） | 0.12 ms | 0.08 ms | — |
| 搜索 单词 / 双词 | 1.71 / 2.68 ms | 1.61 / 2.43 ms | — |
| 统计面板 | 0.24 ms | 0.20 ms | — |
| 搜索每键重算 | 每键 ~27 ms（2000×800 字） | **防抖后每 250 ms 一次** | 输入不再发涩 |

真正的两个大头是**字数统计**和**附件 N+1**；其余是"减少无谓重渲染"的结构性改动，收益体现在帧率而不是单次耗时。

---

## 1. 怎么测的

```bash
bun bench/perf-baseline.ts     # 纯函数：字数/今天/素材/搜索/统计 + 数据层
bun bench/perf-attachments.ts  # 附件 N+1 专项（800 任务 / 1600 附件）
```

要点：

- **预热一次再计时**，避免 JIT 首次编译计入；
- 每个操作跑 5 次取**中位数**（抗抖动）；
- 数据集固定（2000 条任务、1/3 带 800 字正文），保证前后可比。

---

## 2. 做了什么

### 2.1 字数统计加有界 LRU 缓存（最大收益）

**问题**：`countWords` 每次都完整扫描文本。项目字数、「共 N 字」、写作统计这类聚合会对同一批正文**反复**统计——2000 条库里 667 条有正文，一次全量 13.5 ms。而这个值只要正文没被编辑就是稳定的。

**做法**（`features/word-count.ts`）：

- `Map<string, TextCount>` 缓存，命中后把 key 移到末尾（Map 保持插入顺序 → 天然 LRU）；
- 上限 **200 条**、只缓存 **≤8KB** 的文本（长文换新对象代价高、命中率低）；
- 最坏内存约 1.6 MB，可接受；
- 提供 `clearWordCountCache()` 供测试/诊断。

**为什么不用 WeakMap 按 task 对象缓存**：store 是不可变更新的，每次编辑都产生新 task 对象，弱引用命中率极低；按**文本内容**做 key 才稳定。

**代价**：编辑正文后第一次统计仍要走全量（诚实说：这是正确的，内容真的变了）。

### 2.2 附件 N+1 → 一次全表查

**问题**：`collectLocalRecords`（同步/备份/导出都走它）按任务逐个查附件：

```ts
for (const task of tasks) {
  const attachments = await getAttachmentsForTask(executor, task.id);  // N 次
}
```

内存 SQLite 上 800 任务只要 2.8 ms，**看不出问题**。但真机 `expo-sqlite` 每次 query 都要跨 JS↔原生桥，800 次往返是几百毫秒到秒级。

**做法**：新增 `getAllActiveAttachments(executor)`（一条 `SELECT ... WHERE deleted_at IS NULL`），按返回结果直接收集。

**顺带修掉一个漏洞**：旧实现只查"活跃任务"的附件，墓碑任务下**未删除**的附件不会被收集——全表查天然覆盖了这种情况。

### 2.3 稳定数组引用：`getAllTasks`

**问题**：页面里写 `useAppStore((s) => Object.values(s.tasks))`，每次返回**新数组**。zustand 用 `Object.is` 比较快照 → 任何 store 变化都被判成"变了"，列表与派生计算无法被 `React.memo` 命中。

**做法**（`store/selectors/tasks.ts`）：按 `state.tasks` 的**对象引用**做 `WeakMap` 缓存，同一快照多次调用返回同一数组。store 真变了才重新求值。

已替换：`focus.tsx` / `today.tsx` / `CommandPaletteHost.tsx`。

### 2.4 `useNowMinute`：把 `Date.now()` 从 selector 里拿掉

**问题**：`useAppStore((s) => getTodayTasks(s, Date.now()))` 里的 `Date.now()` 每次渲染都不同，加上返回新数组 → 页面无法被 memo，任何 store 变化都重跑 filter+sort。

**做法**（`ui/hooks/useNowMinute.ts`）：返回**按分钟对齐**的时间戳，同一分钟内恒定，跨分钟自动触发一次重渲染——正好对应"到期状态"的最粗粒度变化。

已替换：`today.tsx`、`focus.tsx`、`(tabs)/_layout.tsx`（tab 角标）。

**注意**：需要秒级精确的地方（番茄钟、倒计时）不能用它。

### 2.5 项目详情字数加 `useMemo`

`projectWords` 原先在每次渲染时对项目内所有正文做一次统计。列表滚动/选中都会触发渲染，不缓存等于反复全量统计。加 `useMemo([tasks])` 后只在任务集合变化时算。

### 2.6 搜索输入防抖 250 ms

2000 条 × 800 字的库单次搜索约 27 ms——每按一个键都算，输入法会明显发涩。

**做法**（`app/search.tsx`）：输入框值 `input` 即时回显，真正参与搜索的 `query` 延迟 250 ms 同步。清空输入时立即生效（不留残影）。

### 2.7 搜索：小写缓存 + 倒排索引

**问题**：`searchAll` 每次都要对每条任务的标题与正文做 `toLowerCase()` 再 `indexOf`。2000×800 字的库单次约 27ms。

**做法**（`features/search.ts`）：

1. **小写缓存**：`Map` 按原串缓存 `toLowerCase()` 结果（≤8KB、上限 300 条，最坏约 2.4MB，LRU 淘汰）。
2. **倒排索引**：token → 任务 id
   - 拉丁按词、CJK 按**单字 + 相邻双字（bigram）**；
   - 索引按 `state.tasks` 的对象引用缓存（`WeakMap`），任务集合不变就复用；
   - 查询时先用索引取候选集（各 token 求交），再对候选跑原有的 `indexOf` 精确匹配。

**为什么不会漏召回**：索引只是**预筛**——bigram 是"子串出现"的必要条件，最终仍用 `indexOf` 验证。索引漏掉的只会是"不可能是子串"的记录。

**一个必须注意的细节**：索引必须覆盖**标签**（`searchAll` 允许命中标签）。第一版漏了，测试立刻抓到（`fix` 命中的那批用例少了一条）。情境名不在索引里，单独用"命中的情境 → 反查任务"补齐。

| 查询 | 优化前 | 优化后 |
|---|---|---|
| 单词 | 1.71 ms | **1.04 ms** |
| 双词 | 2.68 ms | **1.22 ms** |

### 2.8 行级 `React.memo`

`TaskRow` 加 `memo` + 自定义比较：比较 `title/done/selected/selectionMode/reorderMode/accent` 与 `meta`/`actions` 引用，**跳过函数 props**（父级每次新建箭头函数，比较引用必然不等，但它们只依赖当前 task，而 task 已参与比较）。

配套：`TaskList` 用 `useMemo` **按 task 缓存** `meta` 与 `actions`（否则每次渲染都是新节点/新数组，memo 形同虚设）。

### 2.9 FlashList（仅原生）

`TaskList` 在 `Platform.OS !== "web"` 时用 `@shopify/flash-list`（2.3.3）渲染，web 保持 `FlatList`——FlashList 依赖原生测量，在 react-native-web 上不可靠。

**风险提示**：FlashList 的收益（行组件回收复用）只在真机可验证。本机无法构建 Android，**这一项需要在真机上做一次滚动/编辑回归**再决定是否保留。

### 2.10 数据库分页

`db/queries.ts` 新增：

| API | 作用 |
|---|---|
| `getTasksPage(executor, {limit, offset, orderBy})` | 分页查询（多取一条判断 `hasMore`，省掉 COUNT） |
| `countTasks(executor)` | 未删除任务总数 |
| `loadBootstrapData(executor, {taskLimit})` | 传 `taskLimit` 时只加载最近 N 条（默认不传 = 全量，行为不变） |

**为什么默认不启用**：同步合并、全文搜索、统计都以"store 里是全量"为前提，贸然增量加载会让这些功能算出错误结果。分页是**大库模式**的基础设施，等真到几千条、启动时间成为问题时再接入"加载更多"。

### 2.11 增量推送（跳过无变化写入）

自动同步会被前后台切换/定时器频繁触发，而多数时候本地毫无改动——此时仍上传整份 `records.json` 纯属浪费（WebDAV/S3 上是实打实的流量与延迟）。

**做法**：记录集指纹（FNV-1a，8 字符）存进 `kv["sync.lastPushFingerprint"]`；与上次一致时**跳过 `writeRecords`**，但 manifest 仍写（体积小，且要更新设备在线状态）。

**测试抓到的真 bug**：第一版按 `(key, value, updated_at)` 写 kv，但 kv 表只有 `(key, value)` 两列——SQLite 直接拒绝，而调用方 `.catch(() => undefined)` 把异常吞了，导致"跳过"永远不生效。修 SQL 后 4 条测试通过（首次写、无改动跳过、改动后恢复写、墓碑也算改动）。

**仍然不是协议级增量**：`records.json` 依旧是全量快照，只是"没变就不传"。真正只传差量需要改远端布局（追加日志 + 水位），那会破坏旧版本兼容性，未做。

---

## 3. 性能预算测试（防退化）

`packages/core/src/__tests__/v4-perf-budget.test.ts`（10 条）：

| 断言 | 阈值 |
|---|---|
| 全库字数统计（缓存命中） | < 20 ms |
| 今天视图 / 素材库（2000 条） | < 30 ms |
| 搜索（单词/双词，2000 条） | < 80 ms |
| 统计面板 | < 40 ms |
| `getAllTasks` 同快照返回**同一引用** | 严格相等 |
| store 更新后 `getAllTasks` 重新求值 | 引用不同 |
| 字数缓存不串味 / 超长文本不入缓存 | 结果正确 |

阈值刻意宽松（CI 机器差异大），目的是拦住**数量级退化**（比如有人把 O(n) 写成 O(n × 全文长度)），不是做精确基准。

---

## 4. 还没做的（诚实清单）

| 项 | 为什么没做 | 什么时候值得做 |
|---|---|---|
| 协议级增量同步（追加日志 + 水位） | 会破坏旧版本兼容性，需要版本协商 | 多设备长期在线、records > 5MB 时 |
| FlashList 真机回归 | 本机无法构建 Android | 下次打包后由真机滚动/编辑验证 |
| 正文增量保存 | 现在每次保存写整段正文；长文连续编辑时写放大 | 单篇 > 5 万字 |

---

## 5. 真机与内存 SQLite 的差异（读数字时的注意事项）

本机测量用的是**内存 SQLite**，它和真机 `expo-sqlite` 有三个关键差别：

1. **查询延迟**：内存库 ~µs，真机跨桥 ~ms 级 → **N+1 类问题在真机上被放大 100–1000 倍**（这也是 §2.2 必须改的原因，尽管内存库上只快了 1.3 ms）；
2. **渲染**：内存库没有 UI 线程竞争，JavaScript 主线程的耗时才是真机瓶颈 → §2.3/2.4/2.6 的收益只在真机可见；
3. **磁盘 IO**：真机写库有 fsync 成本，批量写入的收益比本机明显。

因此：**不要用本机的毫秒数去推断真机体验**；本机数字只用于"同一改动前后"的相对比较。

---

## 6. 复现方式

```bash
cd E:\gtd清单
bun bench/perf-baseline.ts
bun bench/perf-attachments.ts
bun test packages/core/src/__tests__/v4-perf-budget.test.ts
```

要改数据集，直接编辑脚本顶部的 `TASK_COUNT` / `BODY_CHARS` / `SEED`。

# 导入 / 导出格式技术说明

> 面向：想写脚本处理这些文件、想迁移数据、或想知道"导出去再导回来会不会丢东西"的人
> 对应版本：v2.3
> 实现位置：`packages/core/src/features/exporters.ts`、`importers.ts`；动作层 `apps/mobile/src/platform/export-actions.ts`、`desktop-actions.ts`；UI `apps/mobile/src/app/import.tsx`、`app/(tabs)/data.tsx`

---

## 0. 总览

| 格式 | 方向 | 权威性 | 主要用途 | 入口 |
|---|---|---|---|---|
| **备份 JSON** | 导出 + 导入 | ✅ 权威（可无损往返） | 备份、换机、迁移、云备份 | 更多 → 数据 |
| **Markdown** | 导出 + 导入 | 单向为主（有损） | 贴进笔记软件、给人看、简单清单 | 更多 → 数据 / 更多 → 数据 → 导入 |
| **iCalendar (ICS)** | 只导出 | 只读视图 | 导入系统日历 / Google Calendar / Outlook | 更多 → 数据 |
| **Todoist CSV** | 只导入 | 单向 | 从 Todoist 搬家 | 更多 → 数据 → 导入 |
| **TickTick CSV** | 只导入 | 单向 | 从滴答清单搬家 | 更多 → 数据 → 导入 |
| **通用 CSV** | 只导入 | 单向 | 任意工具（列名自己映射） | 更多 → 数据 → 导入（选「通用」） |

一句话取舍：**只有 JSON 是"存数据"的格式，其它三个都是"给别的软件/人看"的格式。**

---

## 1. 出口与入口

### 1.1 导出（三端不同，格式相同）

`saveTextFile(fileName, content, mimeType, target)` 是唯一出口：

| 平台 | 「保存」 | 「分享」 |
|---|---|---|
| 桌面（Electron） | `dialog.save` 选路径 → `fs.writeFile` | 同左（无分享面板） |
| Android | 系统文件选择器（SAF）写入用户选定目录 | 写沙盒 `documentDirectory` → 系统分享面板 |
| iOS | 写沙盒 `documentDirectory` → 分享面板（可「存储到文件」） | 同左 |
| 纯浏览器 | 抛错（无存储端口） | — |

文件名：`gtd-YYYY-MM-DD.{md,ics,json}`（按本地日期）。

### 1.2 导入（两个入口，语义不同）

| 入口 | 接受 | 走哪条路 |
|---|---|---|
| 更多 → 数据 →「导入 Markdown / Todoist」 | Markdown / Todoist CSV / TickTick CSV / 通用 CSV（粘贴文本） | 解析成草稿 → 逐条 `task.create` |
| 更多 → 数据 →「从 JSON 导入（合并）」 | 备份 JSON 文件 | `import.merge` 命令（记录级合并） |

---

## 2. 备份 JSON（权威格式）

### 2.1 信封

```json
{
  "app": "gtd",
  "version": 1,
  "exportedAt": 1762300000000,
  "records": [ { "type": "task", "record": { ... } }, ... ]
}
```

| 字段 | 说明 |
|---|---|
| `app` | 固定 `"gtd"`（不校验，但用于识别） |
| `version` | 当前 `1`；导入端**只读 `records`**，不因版本号拒绝 |
| `exportedAt` | 导出时刻（毫秒） |
| `records` | `{ type, record }[]`，`type ∈ task / project / section / context / area / attachment / template` |

### 2.2 确定性（重要）

同一个库 + 同一个 `now`，导出的字符串**逐字节相同**：

- `records` 按 `record.id` 字典序排序；
- 每条记录**按显式字段顺序**重建对象（不依赖对象属性插入顺序）；
- `JSON.stringify(payload, null, 2)`（2 空格缩进、无尾随空格）。

这条保证让「云备份去重 / 差分对比 / 签名」都成立。

### 2.3 各类型字段

所有记录都含 `BaseRecord`：`id`（uuidv7）、`createdAt`、`updatedAt`、`revision`、`deletedAt`。

| type | 业务字段 |
|---|---|
| `task` | `title`、`notes`、`status`（`inbox/next/waiting/someday/done`）、`priority`（0–3）、`deferUntil`、`dueAt`、`completedAt`、`lastCompletedAt`、`projectId`、`sectionId`、`contextIds[]`、`tags[]`、`waitingFor`、`starred`、`recurrence`（`freq/interval/byWeekday/lastWeekday/remainingCount/until`）、`checklist[]`（`id/title/done/orderKey`）、`orderKey` |
| `project` | `name`、`description`、`kind`（`sequential/parallel`）、`status`、`color`、`areaId`、`reviewIntervalDays`、`lastReviewedAt` |
| `section` | `projectId`、`name`、`orderKey` |
| `context` | `name`、`color`、`icon` |
| `area` | `name`、`color`、`orderKey` |
| `template` | `name`、`title`、`notes`、`priority`、`projectId`、`contextIds[]`、`tags[]`、`checklist[]`、`recurrence` |
| `attachment` | 元数据：`taskId`、`fileName`、`mimeType`、`size`、`storagePath`（**二进制不入库、不导出**） |

### 2.4 导入语义（`import.merge`）

- 每批 **300 条**（`chunkRecords`），每条记录独立参与合并；
- 合并规则与同步完全一致：**revision 优先**，任务在有基线时走**字段级 3-way**（见 `sync-overview.md` §4）；
- 记录类型/字段先经 `coerceTaggedRecords` 白名单强转，非法记录**丢弃**而不是报错；
- 导完后 `bootstrapStore()` 重载，界面立即反映。

> **已知弱点**：`importFromFile()` 对每批 `import.merge` 用 `.catch(() => undefined)`，批次级失败会被静默吞掉，UI 只报"已合并 N 条"（N 是**读到的记录数**，不是成功数）。如果要严格核对，请对比导入前后的库统计。

---

## 3. Markdown 导出

### 3.1 结构

```markdown
# GTD 清单

## 工作                      ← 区域（area）
### 上线 v2.0                 ← 项目（project）
- [ ] 写发布说明 📅 2026-11-07 !!! #本周 @电脑
- [x] 准备回滚脚本
## 未归类                     ← 无区域的项目 + 收集箱
### 收集箱
- [ ] 买牛奶 📅 2026-11-06
```

### 3.2 每条任务的组成

顺序固定：`- [ ] 标题` → `📅 YYYY-MM-DD`（仅有到期日时）→ 优先级 `!!! / !! / !`（3/2/1）→ `#标签` → `@情境`。

- 已完成任务 `- [x]`（默认**不导出**，`includeCompleted` 才导出）；
- 笔记：`includeNotes` 时另起一行 `  > 笔记内容`（压成单行）；
- 转义：标题里的 `[` `]` 加反斜杠，所有连续性空白折叠为一个空格；
- 排序：区域按 `orderKey`→`createdAt`；项目按 `createdAt`；任务按 `orderKey`→`createdAt`→`id`；
- 空分组不输出（没有任务的项目、没有项目的区域直接跳过）。

### 3.3 会丢什么

| 字段 | Markdown 里 |
|---|---|
| 到期**时刻** | 只保留日期（`📅 2026-11-07`） |
| 开始/推迟时间（`deferUntil`） | ❌ 不导出 |
| 重复规则、清单子项、等待对象（`waitingFor`）、星标、分区（section）、项目描述 | ❌ 不导出 |
| 优先级 | ✅ `!!!` 形式 |
| 标签 / 情境 | ✅ 但见 §7 的往返陷阱 |

---

## 4. Markdown 导入

### 4.1 识别规则（`parseMarkdownTasks`）

| 行形态 | 解释 |
|---|---|
| `#{1,6} 标题` | 成为**项目名**（后续任务都挂到它） |
| `- [ ] 文本` / `- [x] 文本` | 任务（`x` = 已完成） |
| 缩进更深的 `- 文本`（非复选框） | 并入**上一条任务**的笔记（作为 `- 文本`） |
| 其它非空行 | 追加到上一条任务的笔记 |
| 空行 | 忽略 |

### 4.2 标题里的语法照常生效

每行标题都会过一次 `parseQuickAdd`，所以这些标记不会被丢掉：

`@情境`（可多个）· `#项目` · `+标签`（可多个）· `!`/`!!`/`!!!` · `>某人`（等待）· `今天/明天/周五/3天后/2026-11-05/下午3点` 等自然语言日期。

行内 `#项目` 会覆盖所在分组的项目名。

### 4.3 落地方式

项目 `project.upsert`（find-or-create）→ 情境 `context.upsert` → `task.create` → 若完成则补 `task.complete`。
上限 **5000 条**（超出计为 `skipped`）。逐条事务，失败即停并报告已完成条数。

---

## 5. Todoist CSV

### 5.1 列识别（大小写不敏感，取第一个命中的别名）

| 逻辑字段 | 接受的表头 |
|---|---|
| 类型 | `type` |
| 标题 | `content` / `task` / `title` |
| 笔记 | `description` / `notes` |
| 优先级 | `priority` |
| 到期 | `due date` / `due` |
| 标签 | `labels` / `label` |
| 项目 | `project` / `project name` |

缺 `content`（及其别名）列 → 直接报「缺少 CONTENT 列」并放弃本次导入。

### 5.2 规则

- 只导入 `TYPE=task` 的行（`section`/`note` 行计为跳过）；
- 优先级 `P1..P4` → `3/2/1/0`（另兼容直接写 `0–3`）；
- 到期日走 §8 的日期解析；
- 标签按 `,` 或 `;` 拆分去重（同名忽略大小写差异）；
- 项目名非空则建项目。

---

## 6. TickTick CSV

| 逻辑字段 | 接受的表头（中英） |
|---|---|
| 标题 | `title` / `标题` / `任务` |
| 笔记 | `content` / `description` / `内容` / `描述` / `notes` |
| 优先级 | `priority` / `优先级` |
| 到期 | `due date` / `due` / `截止日期` / `到期日` |
| 标签 | `tags` / `标签` |
| 项目 | `list` / `清单` / `project` / `项目`；回退 `folder` / `文件夹` |
| 完成 | `status` / `状态` |

- 优先级支持 `高/中/低/无`、`High/Medium/Low/None`、`0–3`、`P1–P4`（`normalizeImportPriority`）；
- 完成判定：`completed/complete/done/true/yes/1/已完成/完成`（`normalizeImportCompleted`）。

---

## 7. 通用 CSV（列映射）

调用方显式给出映射（`CsvColumnMapping`）：

```ts
{ title: "任务名", notes?: "备注", priority?: "优先级", due?: "截止", tags?: "标签", project?: "项目", status?: "状态" }
```

- 表头名**大小写不敏感**，值必须是 CSV 里真实存在的列名；
- 缺标题列 → 报「缺少标题列「X」」；
- 其余规则与 TickTick 一致（同一套 `applyDraftFields`）。

> 注意：当前 UI 的导入页只提供 `自动 / Markdown / Todoist / TickTick` 四档；**通用映射是 core 能力，UI 尚未暴露**（`parseImportText` 检测到"像 CSV 但认不出"时会提示"请选择 TickTick 或使用通用映射"）。这是一个待补的入口。

---

## 8. 格式自动识别（`detectImportFormat`）

按顺序判（只看前 2000 字符）：

| 判据 | 结果 |
|---|---|
| 首行含 `,` 且出现 `type` 列 + 文本里有 `content` | `todoist` |
| 首行含 `,` 且首行有 `title/标题` 且出现 `list/清单/folder/文件夹` | `ticktick` |
| 首行含 `,` 且首行有 `title/标题` | `generic`（能识别是 CSV，但不知道怎么映射 → 提示用户选格式） |
| 出现 `- [ ]` / `- [x]` | `markdown` |
| 出现 `# 标题` | `markdown` |
| 都不匹配 | 提示「无法识别的格式」 |

---

## 9. 日期解析（`parseImportDate`）

只接受"类 ISO"形态，**不做模糊解析**：

| 输入 | 结果 |
|---|---|
| `2026-11-05` | 当天 **18:00**（与快速添加一致） |
| `2026-11-05 18:00` / `2026-11-05T18:00` | 指定时刻 |
| `2026-11-05T18:00:30` | 秒被保留 |
| `2026/11/05`、`11月5日`、`明天` | ❌ 不认识（返回 null，导入时忽略该列值） |
| `2026-02-30` | ❌ 非法日期（校验 year/month/day 回读一致） |

时区：按**本地时区**解释（`new Date(y, m-1, d, h, min)`）。

---

## 10. iCalendar 导出（ICS）

| 项 | 值 |
|---|---|
| 头 | `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//GTD List//CN//EN` / `CALSCALE:GREGORIAN` |
| 事件范围 | 只有 `dueAt != null` 且未删除的任务 |
| `UID` | `<taskId>@gtd` → **重复导出不会在日历里产生重复事件** |
| `DTSTART` | `dueAt`（本地时间，**无 TZID**） |
| `DTEND` | `dueAt + 30 分钟` |
| `DTSTAMP` | 导出时刻（UTC，带 `Z`） |
| `SUMMARY` / `DESCRIPTION` | 标题 / 笔记，转义 `\ ; ,` 与换行（`\n`） |
| 行尾 | 一律 `CRLF` |
| 折行 | 按 **75 octet** 折行，续行以 1 个空格开头；按 Unicode 码点切分，不会截断多字节字符 |

⚠️ 因为 `DTSTART` 没带 `TZID`，导入到别的时区/别的日历时，会被当成"浮动时间"（按查看者本地时间解释）。这是刻意取舍（避免 VTIMEZONE 复杂度），代价是跨时区协作时时间会漂。未导出 `RRULE`，重复任务在日历里只出现一次。

---

## 11. 往返保真矩阵

| 场景 | 结果 |
|---|---|
| JSON 导出 → JSON 导入 | ✅ 无损（含 revision/墓碑/附件元数据） |
| JSON 导出 → 新库导入 | ✅ 记录原样进入（revision 保留，所以不会被旧数据覆盖） |
| Markdown 导出 → Markdown 导入 | ⚠️ 有损：见下 |
| ICS → 本应用 | ❌ 不支持导回（只出不进） |
| Todoist/TickTick/通用 CSV → 本应用 | ✅ 单向导入 |

### Markdown 往返会怎么变

| 项 | 结果 |
|---|---|
| 标题 / 完成态 / 优先级 | ✅ 保留 |
| 到期**日期** | ✅ 保留（但会残留 `📅` 字样进标题，见下） |
| 到期**时刻** | ❌ 退化为 18:00 |
| 项目 / 区域分组 | ✅ 区域变一级标题、项目变二级标题；导入时按二级标题建项目（区域层级**不**还原） |
| 笔记 | ✅（`includeNotes` 打开时） |
| **标签** | ⚠️ **会变成项目**：导出写 `#本周`，而导入语法里 `#` 是**项目**前缀，`+` 才是标签 |
| 情境 | ✅ `@电脑` 双向一致 |
| 星标 / 重复 / 清单 / 等待对象 / 分区 / 推迟时间 | ❌ 丢失 |

> 所以：**需要无损迁移请走 JSON；Markdown 只用于"给人看 / 给别的工具读"。**

---

## 12. 限额与错误处理

| 项 | 值 |
|---|---|
| 文本导入上限 | **5000 条**（`IMPORT_TASK_LIMIT`），超出计为 `skipped` |
| JSON 导入 | 无硬上限，按 300 条/批顺序执行 |
| 坏行策略 | 跳过 + 计入 `skipped`，**不因一行失败中止整次导入** |
| 缺关键列 | 返回空计划 + `warnings`（"缺少 CONTENT/TITLE 列"） |
| 导入中断 | 逐条事务，失败即停；toast 报「已导入 N 条后失败」 |
| CSV 解析 | 支持双引号包裹、`""` 转义、字段内换行、CRLF、UTF-8 BOM |
| 编码 | 一律 UTF-8；导出的 JSON/Markdown/ICS 均为 UTF-8 无 BOM |

---

## 13. 互操作建议

| 想把数据搬到 | 用哪个 | 说明 |
|---|---|---|
| 自己另一台设备 | **JSON**（或直接开同步） | JSON 带 revision，合并最干净 |
| Obsidian / Logseq / 笔记软件 | **Markdown** | 复选框清单通用；标签会变项目，注意检查 |
| 系统日历 / Google Calendar / Outlook | **ICS** | 一次性导入；重复任务需在日历里自己设 |
| Excel / 脚本处理 | **JSON** | 结构稳定、字段有类型 |
| 从 Todoist 迁出 | 导出 Todoist CSV → 本应用导入 | 保留项目、标签、优先级、到期日 |
| 从滴答清单迁出 | 导出 TickTick CSV → 本应用导入 | 同上，项目取 List/Folder |

---

## 14. 验证与回归

| 测试文件 | 覆盖 | 用例数 |
|---|---|---|
| `packages/core/src/__tests__/v2-importers.test.ts` | Markdown/Todoist/TickTick/通用 CSV、日期校验、CSV 引号与换行 | 18 |
| `packages/core/src/__tests__/v2-exporters-errors.test.ts` | Markdown/ICS/JSON 导出、确定性（同输入字节相同）、错误类型 | 13 |

跑法：

```bash
cd E:\gtd清单
bun test packages/core/src/__tests__/v2-importers.test.ts packages/core/src/__tests__/v2-exporters-errors.test.ts
```

---

## 15. 已知缺口（可排期）

1. **标签往返错位**：Markdown 导出用 `#标签`，导入按项目解析 → 要么导出改 `+标签`，要么导入区分"标题行的 `#`"与"任务行的 `#`"。
2. **通用 CSV 映射没有 UI**：core 已支持，导入页只暴露四档。
3. **JSON 导入批次错误被静默吞掉**（§2.4）。
4. **Markdown 导出不含时间的时区/时刻**，且会残留 `📅` 字样。
5. **没有 ICS 导入**（日历 → 任务方向没做）。

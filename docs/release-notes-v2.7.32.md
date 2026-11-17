# v2.7.32 · 评审第 ③ 条的两个低风险部分

## 背景

两轮评审里第 ③ 条一直挂着，原文是：
「bottom tab bar 5 items → 2–3, red badge, black showUndo bar — out of scope of first-screen redesign」。

这一条包含三件事，我只做了其中两件，**tab 数量没动**（理由在末尾）。

## ① 底栏角标：红色 → 赭石，去掉浮起阴影

```diff
- <View style={[styles.badge, { backgroundColor: colors.danger }]}>
+ <View style={[styles.badge, { backgroundColor: colors.primary }]}>
```

```diff
  justifyContent: "center",
- ...elevation.float,
```

理由：角标只是「有 N 件」的计数，不是错误。
在这套配色里红色是「逾期 / 删除」的警报语汇，用在计数上把注意力
从「现在该做的那一件」抢走了——而这正是《纸与当下》要压住的东西。
一个小计数也不该有浮起的投影。

## ② 撤销条：近黑横杠 → 纸面便签条

```diff
- style={[styles.bar, elevation.float, { backgroundColor: colors.text }]}
+ style={[styles.bar, elevation.float, {
+   backgroundColor: colors.surface,
+   borderColor: colors.border,
+   borderWidth: StyleSheet.hairlineWidth,
+ }]}
```

配套把图标与文字从 `colors.canvas`（黑底上的浅色）改为
`colors.primary`（赭石勾）与 `colors.text`（墨色字）。
「撤销」按钮保持赭石。

理由：`colors.text` 在浅色主题里是接近黑的深色，一条黑横杠横在暖白纸面
底部，是整套界面里最违和的元素。改后它像一张贴在纸上的便签，
仍然浮在内容之上（保留 `elevation.float`），但不再是「系统警告」的语气。

## ③ 没做：底栏 5 个 tab 减到 2–3

**故意不改。** 理由：

- 这是每天要点几十次的入口，减错了比不改更烦
- 5 个 tab（Inbox / Today / Focus / Projects / More）各自承载独立功能，
  合并需要先决定「谁并进谁」，那是一次信息架构调整，不是配色修补
- 我没有真机使用数据来判断哪几个 tab 实际低频

需要你决定：如果真机上确实觉得底栏拥挤，告诉我「哪几个你几乎不点」，
我再按实际使用频率合并，而不是凭猜测砍。

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **519 项 / 44 文件全绿**
- 设备截图 `android-report/nav-shell/`，像素判定：

  | 检查 | 结果 |
  |---|---|
  | 底栏区赭石 `(140,61,11)` 像素数 | **4031** |
  | 底栏区红色 `(180,35,24)` 像素数 | **0** |
  | 撤销条实拍 | `✓ Completed "回复客户邮件" \| 2 undo steps \| Undo`，纸底、赭石勾与文字 |

## 验证时踩到的一个测试污染（不是产品缺陷）

截图里一度出现 5 组同名任务（预约体检 ×2、量书房尺寸 ×2 等）。
查服务端 `records.json` 确认：**10 个任务、10 个唯一 id，没有任何重复 id**。

原因是 `pm clear` 清库后种子任务用**新 uuid** 重建，
再同步时服务器上旧 uuid 的种子任务也被拉回来 → 同名不同 id。

真实用户不会反复清库并同步同一账号，所以这是**测试方法造成的**。
已写进 `docs/dev-env-runbook.md`。做同步相关验证后要清服务端数据目录。

## 升级

- versionCode 65 → 66，同一签名
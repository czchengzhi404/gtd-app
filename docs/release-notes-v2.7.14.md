# v2.7.14 · 首启引导修活 + 项目分区可用

这一版把两个「代码有、用户用不到」的功能补上了。

## 1. 首启引导：之前是死代码

`/onboarding` 整页写好了（完成回调、示例任务、写 kv 标记），但**永远不可能出现**：

```ts
if (state.kv["onboarding.done"] === "1") return;
if (Object.keys(state.tasks).length > 0) {   // ← 问题在这
  void runCommand("settings.set", { key: "onboarding.done", value: 1 });
  return;
}
router.replace("/onboarding");
```

判断条件是「有没有任务」。而 `seedIfNeeded()` 在 bootstrap 里**先**跑，第一件事就是写 4 条种子任务
（整理桌面 / 回复客户邮件 / 预约体检 / 量书房尺寸）。所以这个分支永远成立 →
新用户永远直接进主界面，引导页一次都不会显示。

修法是让「是不是真的第一次」有明确来源，而不是从结果反推：

```ts
// seed.ts：返回这次是否真的种了数据
export async function seedIfNeeded(): Promise<boolean>

// bootstrap.ts：透传给根布局
export interface PlatformInitResult { …, justSeeded: boolean }

// _layout.tsx
if (state.kv["onboarding.done"] === "1") return;
if (!justSeededRef.current) {           // seeded 已存在 → 老用户升级，静默补标记
  void runCommand("settings.set", { key: "onboarding.done", value: 1 });
  return;
}
router.replace("/onboarding");          // 真·首次安装
```

语义变清楚了：**刚种下种子数据的那一次 = 首次安装**。老用户升级时 `seeded` 早已存在，
`justSeeded=false`，只会静默补个标记，不会被打扰。

## 2. 项目分区：只有后端，没有 UI

`section.create` 这个命令从 schema 到 handler 到测试都齐全，项目详情里**渲染**也实现了
（按 `sectionId` 分组、显示分区标题）。但全仓库搜下来，**没有任何一行 UI 调用它** ——
也就是说用户根本建不了分区，那段分组渲染永远空转。

补了两处：

### 建分区（项目详情）
Chip「新建分区」→ `showPrompt` 要名字（带非空校验）→ `section.create`。

### 指派分区（任务详情）
任务挂了项目、且项目里有分区时，详情页出现「分区」选择区：
`不分区` + 各分区 chip，选中状态跟随 `task.sectionId`，点击走 `task.update` 的 `patch.sectionId`。

不传 `onSetSection` 就整块不显示——避免在没有项目的任务上露一个空壳。

## 3. 顺带确认：命令面板在手机上已有等价物

`CommandPaletteHost` 的注释写着「移动端右上角搜索图标（见各页 PageHeader 的 onSearch）」，
但 `PageHeader` 根本没有 `onSearch` 这个属性，也没有任何页面传过——**注释是过期的**。

不过移动端并不缺这个能力：「更多 → 搜索」进的是整页版全局搜索（`/search`），
带范围切换（任务/项目）、命中字段高亮、最近搜索，功能是命令面板的超集。
所以这里不改代码，只把注释和文档的说法纠正过来。

## 验证

- `tsc`（ui / mobile）通过
- `bun test` **489 项 / 40 文件全绿**
- 设备实测见发布后补充

## 升级

- versionCode 47 → 48，同一签名

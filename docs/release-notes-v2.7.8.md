# v2.7.8 · 「用其他应用打开」直接导入 JSON

> ⚠️ **这一版的功能是坏的**：intent-filter 注册成功，但 expo-router 会把 `content://`
> 当深链处理，点开 JSON 后落到一整页 **Unmatched Route**（比不做还糟）。
> 路由改写在 **v2.7.9** 修复，请直接装 v2.7.9 或更新版本。
> 下面保留原始记录，从「实现」一节可以看到漏掉的那一环。

## 解决的痛点

之前从微信导入一份清单要绕四步：

1. 微信里点开 .json → 「用其他应用打开」
2. 选系统「文件」→ 保存到「文档」
3. 回 App → 数据与记录 → 从 JSON 导入（合并）
4. 在选择器里一层层找到那个文件

根因是**微信把收到的文件存在自己的私有目录**（`Android/data/com.tencent.mm/...`），
Android 11+ 不允许别的应用读那里，所以必须先让微信把文件「交出来」到公共目录。

现在第 1 步的列表里会**直接出现 GTD List**，点一下就导完。

## 实现

### 1. intent-filter（`apps/mobile/plugins/withJsonImportIntent.js`）

新增一个 config plugin，在 `MainActivity` 上注册：

```
action    = android.intent.action.VIEW
category  = DEFAULT, BROWSABLE
data      = content:// + application/json
            file://    + application/json
```

两个取舍：

- **只注册 ACTION_VIEW，不注册 ACTION_SEND**。ACTION_VIEW 的文件在 intent data 里，
  RN 的 `Linking.getInitialURL()` 能直接拿到；ACTION_SEND（「分享到」）的文件在
  `EXTRA_STREAM` 里，RN 没有暴露读取接口，要接就得写原生模块。
  与其做一个点了没反应的入口，不如不做。
- **mimeType 只放 `application/json`**，没放 `text/plain` / `application/octet-stream`。
  后两者会让打开任意 .txt、任意未知类型文件时都冒出本应用，属于骚扰。
  App 内的「从 JSON 导入」仍在，覆盖剩下的小概率情况。

插件是幂等的（重复执行不会追加第二份 filter），找不到 `.MainActivity` 时只警告不抛错。

### 2. 接住文件（`apps/mobile/src/platform/incoming-file.ts`）

- **冷启动**：模块加载早期就把 `Linking.getInitialURL()` 的 Promise 抓住，
  避免被 expo-router 消费完之后才读。
- **热启动**：`Linking.addEventListener("url")` 接住 App 在后台时的新文件。
- 用一个 `handled` Set 去重，防止冷启动 + 事件双触发导致同一份文件导两遍。
- 读取用 `readAsStringAsync(uri)`——它在 Android 上走 ContentResolver，
  能读别的应用通过 FileProvider 递过来的 `content://`（SAF 同步那条链路也是这么读的）。

### 3. 复用同一条写路径

把 `mergeImportedJson` 从 `desktop-actions.ts` 里导出，分享导入与文件选择器导入
走**完全相同的**解析 / 分批 `import.merge` / 重建 store 逻辑，不存在两份实现。

导入完成后统一 `router.replace("/data")`：即使 expo-router 先把 `content://`
当成未知路由渲染了一瞬，也会立刻被替换掉，用户不会卡在「Unmatched Route」。

## 验证

- `tsc -p apps/mobile` 通过
- `bun test` 476 项 / 39 文件全绿
- 插件单测：`node bench/check-json-intent-plugin.mjs` 校验产出结构、幂等性、
  缺 MainActivity 时的容错
- 设备上的真实 intent 验证见发布后补充

## 升级

- versionCode 41 → 42，同一签名

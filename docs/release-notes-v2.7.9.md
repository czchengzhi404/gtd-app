# v2.7.9 · 修好「用其他应用打开」导入 JSON

> ⚠️ **这一版仍然没修完**：Unmatched Route 确实没了，导入页也跑起来了，
> 但原始 URL 是塞在路由参数里传的，而路由参数会被**百分号解码**——
> `primary%3ADocuments%2Ffile.json` 到页面里变成 `primary:Documents/file.json`，
> 系统报 `Invalid URI`。传参方式在 **v2.7.10** 改成模块变量，请装 v2.7.10 或更新版本。
> 下面保留原始记录，用来对照「改对了什么、还差什么」。

## v2.7.8 漏了什么

v2.7.8 注册了 `VIEW + application/json` 的 intent-filter，编译出来的 manifest 里也确实有：

```
action   = android.intent.action.VIEW
data     = content:// + application/json
           file://    + application/json
```

但装到设备上一按就露馅——点开 JSON 后是一整页 **Unmatched Route**：

```
gtd://com.android.externalstorage.documents/document/primary%253ADocuments%252Fgtd-junshi-999.json
```

两个问题叠在一起：

1. **expo-router 把 `content://` 当深链吃掉了**。它拿到 intent data 后会归一化
   （scheme 换成 app 的 `gtd://`），然后按路由匹配 —— 当然匹配不到，于是渲染 404 页。
2. **根布局里那套 `Linking.getInitialURL()` 拿不到 URL**。等我们的 effect 跑起来时，
   URL 已经被路由消费掉了，所以导入逻辑一次都没执行（日志里没有任何报错，静默什么都没发生）。

也就是说：**入口做出来了，但用户点进来看到的是报错页**，比不注册还糟。

## 怎么修的

改成「让路由系统全程自洽」，而不是在它出问题之后再补救：

### 1. `app/+native-intent.ts` —— 在路由计算之前改写

expo-router 提供 `redirectSystemPath` 钩子（`getLinkingConfig` 里在 `getStateFromPath`
**之前**调用），拿到的是**完整的原始 URL**。于是：

```ts
export function redirectSystemPath({ path }) {
  if (path.startsWith("content://") || path.startsWith("file://")) {
    return `/import-incoming?raw=${encodeURIComponent(path)}`;
  }
  return path;
}
```

`content://` 不再是「未知路由」，而是一条正常路由，Unmatched Route 从根上消失。
原始 URL 作为参数带过去，文件内容一点没丢。

### 2. `app/import-incoming.tsx` —— 真正干活的页面

读 `raw` → `readIncomingFile` → `mergeImportedJson`（与文件选择器导入**同一条写路径**）
→ 显示「已合并 N 条记录」→ 1.2 秒后回数据页。失败则显示错误原因和「返回」按钮，
不会静默停在空白页。

`started` ref 防 StrictMode 下 effect 跑两遍导致重复导入。

### 3. 热启动单独兜

`redirectSystemPath` 只在**冷启动**生效（`link/linking.js` 里那条 `subscribe` 分支
仅在 Expo Go 下才调用它）。所以 App 在后台时再收到文件，改由根布局的 `Linking`
url 事件接住，`router.push` 到同一个页面 —— 导入逻辑仍然只有一份。

## 验证

自动化脚本 `scripts/verify-share-import.mjs` 全程跑真机 intent：

```powershell
adb shell am start -a android.intent.action.VIEW \
  -d "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Fgtd-junshi-999.json" \
  -t application/json --grant-read-uri-permission -n app.gtd.local/.MainActivity
```

要断言的是：系统把本应用列为候选、冷启动导入成功、落到数据页、项目页出现清单。

- `tsc -p apps/mobile` 通过
- `bun test` 476 项 / 39 文件全绿
- `node bench/check-json-intent-plugin.mjs` 插件产出结构 / 幂等性 / 容错
- 设备实测结果见本节后续补充

## 升级

- versionCode 42 → 43，同一签名

# v2.7.10 · 「用其他应用打开」导入 JSON（第三版，终于对了）

## 前两版各错在哪

这个功能连着踩了两个坑，都不是 intent-filter 的问题——filter 从 v2.7.8 起就是对的，
`aapt2 dump xmltree` 在编译产物里能看到 `content:application/json`。

### v2.7.8：expo-router 把 `content://` 当深链吃掉了

点开 JSON 后是一整页 **Unmatched Route**：

```
gtd://com.android.externalstorage.documents/document/primary%253ADocuments%252Fgtd-junshi-999.json
```

expo-router 拿到 intent data 会归一化（scheme 换成 app 的 `gtd://`）再匹配路由，
匹配不到就渲染 404 页。而且它的路由逻辑比根布局里的代码更早拿到 URL——
我写的 `Linking.getInitialURL()` 那条路一次都没执行（日志零报错，静默什么都没发生）。

### v2.7.9：把 URL 塞进路由参数，被百分号解码解坏了

改成用 expo-router 的 `redirectSystemPath` 钩子（在路由计算**之前**调用，
拿到的是完整原始 URL），把 `content://` 改写成 `/import-incoming?raw=...`。
Unmatched Route 没了，导入页也真的跑起来了，但报：

```
Invalid URI: content://com.android.externalstorage.documents/document/primary:Documents/gtd-junshi-999.json
```

`%3A` 变成了 `:`、`%2F` 变成了 `/` —— 路由参数会经过百分号解码，
原本编码在 doc id 里的分隔符被还原成真分隔符，URI 结构就断了。

## 这一版怎么做的

**URL 不经过任何编解码**。`+native-intent` 和导入页在同一个 JS 实例里，
用一个模块变量交接就够了：

```ts
// platform/incoming-file.ts
let pendingUrl: string | null = null;
export function setPendingImportUrl(url) { /* 校验 + 去重 + 记下 */ }
export function takePendingImportUrl() { /* 取走并清空 */ }

// app/+native-intent.ts
export function redirectSystemPath({ path }) {
  if (setPendingImportUrl(path)) return "/import-incoming";
  return path;
}

// app/import-incoming.tsx
const rawUrl = takePendingImportUrl();   // 原样拿到 content://，一个字都没动
```

`takePendingImportUrl()` 取走即清空，配合 `handled` Set，冷启动和 url 事件
不会把同一份文件导两遍。

顺带把导入页的空状态也补了：直接访问该页面（没有待导入文件）会立刻回数据页，
不会停在空白屏。

## 这次的验证方式

用真机 intent 模拟微信的行为，而不是只看代码：

```powershell
adb shell am start -a android.intent.action.VIEW \
  -d "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Fgtd-junshi-999.json" \
  -t application/json --grant-read-uri-permission -n app.gtd.local/.MainActivity
```

脚本 `scripts/verify-share-import.mjs` 断言：系统把本应用列为候选、
冷启动导入成功、提示合并条数、落到数据页、项目页出现清单。

- `tsc -p apps/mobile` 通过
- `bun test` 476 项 / 39 文件全绿
- 设备实测结果见本节后续补充

## 升级

- versionCode 43 → 44，同一签名

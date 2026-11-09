# v2.7.11 · 分享导入：修掉首次启动被引导页顶掉

## 这一版修的

v2.7.10 在**已经用过的设备上**验证通过：清库 → 发 intent → 项目出现、23 open。
但换到「**全新安装**」的场景，导入页会被引导页（onboarding）顶掉。

原因：首次启动时 `_layout.tsx` 里那段引导逻辑会 `router.replace("/onboarding")`，
而它和 `/import-incoming` 是并发的——谁后跑谁赢。用户看到的不是「已合并 25 条记录」，
而是一页引导，完全不知道导入成没成。

修法很直接：`incoming-file.ts` 暴露一个**不清空**的 `hasPendingImport()`，
引导逻辑在它有值时不介入。

```ts
// _layout.tsx
if (hasPendingImport()) return;   // 刚收到分享文件，先别引导
```

为什么单独加个 `hasPendingImport()` 而不是复用 `takePendingImportUrl()`：
后者取走即清空，引导逻辑一旦抢先调用，导入页就拿不到 URL 了。

## 为什么这是真 bug，不只是测试问题

自动化测试抓不到那 1.2 秒的导入页，我一开始以为是轮询太慢。
把轮询间隔压到 150ms、去掉循环里的 `dumpsys` 之后还是抓不到，才想到去查「谁把路由抢了」。
真正触发条件很具体：

> **第一次装好 App，直接去微信里分享一份 JSON 进来。**

这是新用户最可能走的第一条路，而它恰好整条链路都在并发启动阶段。

## 验证

自动化脚本 `scripts/verify-share-import.mjs`（`pm clear` 制造全新安装状态）：

```powershell
adb shell am start -a android.intent.action.VIEW \
  -d "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Fgtd-junshi-999.json" \
  -t application/json --grant-read-uri-permission -n app.gtd.local/.MainActivity
```

关键的前后对照：

| 断言 | 含义 |
|---|---|
| 清库后清单项目**不存在** | 前置条件 |
| 发 intent 后出现导入页 | 引导页不再抢占 |
| 提示「已合并 25 条记录」 | 导入真的跑了 |
| 项目页出现清单 · 23 open | 数据真的落库了 |

- `tsc -p apps/mobile` 通过
- `bun test` 476 项 / 39 文件全绿
- 设备实测结果见本节后续补充

## 升级

- versionCode 44 → 45，同一签名

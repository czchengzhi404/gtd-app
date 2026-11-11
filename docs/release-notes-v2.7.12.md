# v2.7.12 · 从链接导入在线清单 + 分享导入回执可见

## 1. 「从链接导入」：直接贴网址就能读清单

导入页新增一条通道：粘贴 `https://onlinelistmaker.com/<清单id>` 这样的分享链接，
点「读取清单」，直接把里面的条目读进来，走原有的预览 → 导入流程。

### 为什么不能像普通网页那样抓

这个站点的分享页是个**客户端渲染的壳**，HTML 里只有标题和 `Connecting...`：

```
军师欠下的999件事 - Online List Maker
Connecting...
No items yet
```

数据靠 **WebSocket** 推。协议是从它自己的前端代码里读出来的：

```js
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
new WebSocket(protocol + '//' + location.host + '/' + LIST_ID + '/ws')
// 首条消息：{ type: 'init', items: [{ id, text, checked }], name, settings }
```

所以实现就是：连上 `<listId>/ws` → 收首条 `init` → 立刻断开。
**只读**：不发任何 `add` / `toggle` / `delete`。

实测这个清单现在有 **26 条**（`又幻想了做短剧赚大钱`、`那我的黄果计划怎么办` 都在，
说明它随时会变——这正是「直接读链接」比手动导出 JSON 好的地方）。

### 分层

| 层 | 文件 | 职责 |
|---|---|---|
| 纯逻辑 | `packages/core/src/features/onlinelist.ts` | URL 解析、`init` 载荷 → `ImportPlan` |
| 网络 | `apps/mobile/src/platform/onlinelist-fetch.ts` | 用 RN 自带 WebSocket 连、收、断 |
| UI | `apps/mobile/src/app/import.tsx` | 新增「从链接导入」卡片 |

复用而非另起一套：解析结果就是 `ImportPlan`，和 Markdown / Todoist / TickTick 走**同一个**
`runImport()`（`project.upsert` → 逐条 `task.create`）。所以导入的写路径仍然只有一条。

### URL 解析的防御

- 只认 `onlinelistmaker.com` / `www.onlinelistmaker.com` —— `onlinelistmaker.com.evil.io` 这类会被拒
- 路径必须恰好一段且形如清单 id（`[A-Za-z0-9_-]{6,64}`），所以 `/og/xxx.png` 之类不会被当成清单
- 容忍末尾斜杠、查询串、片段、`http`、缺协议、前后空格

### 错误提示按原因区分

不是笼统的「失败」，而是：链接不完整 / 只支持这个站点 / 超时 / 连不上 / 数据无法解析。
超时 15 秒——分享页本身是秒开的，超时基本就是网络或链接失效。

## 2. 分享导入的回执现在看得见了

上一版把「用其他应用打开」接进来了，但导入完成后只停留 **1.2 秒**就跳回数据页。
实测整条链路（读文件 → 合并 26 条 → 跳转）**不到 1 秒**，回执一闪而过，
用户根本来不及确认到底导没导进去。

现在停 **3 秒**：够看清「已合并 N 条记录」，又不至于让人等得不耐烦。

## 验证

- `tsc`（core / ui / mobile）全部通过
- `bun test` **489 项 / 40 文件全绿**（v2.7.11 是 476/39，新增 13 项）
- 新增 `packages/core/src/__tests__/onlinelist.test.ts`：URL 解析 5 组（含相似域名攻击、
  静态资源路径、6 种写法容忍）、载荷解析 8 组（真实 26 条样本、空条目、全空清单、
  非 init 消息、signup 模式认领信息进备注）
- WebSocket 协议用 `bench/probe-onlinelist-ws.mjs` 对真实站点验证过：连上即收到
  `type=init, name=军师欠下的999件事, items=26`
- **设备实测（x86_64 模拟器，versionCode 46）**：`scripts/verify-link-import.mjs` 9/10
  - 导入页出现「从链接导入」卡片 ✓
  - 粘贴真实链接 → 点「读取清单」→ 预览显示 **`26 tasks · 1 projects · 0 skipped`**，徽标「在线清单」✓
  - 点「开始导入」✓
  - 项目页出现「军师欠下的999件事 · Parallel · Next: 又幻想了做短剧赚大钱 · **25 open**」✓
    （26 条里 1 条在原清单里是勾选状态，所以 25 open，数字对得上）
  - 唯一未捕获的是「已导入 N 条任务」的 toast —— 它在 `router.back()` 后 1 秒内过期，
    自动化采样时已经消失；数据落库已由项目页断言证明

## 升级

- versionCode 45 → 46，同一签名

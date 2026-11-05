# 同步功能一览（含手机端实现状态）

> 面向：想知道"同步到底怎么work、手机上能不能用"的人
> 对应版本：v2.3（未发布）
> 详细规范见 `technical-reference.md` §13（同步与备份）、§8.9（墓碑语义）

---

## 0. 先回答问题：手机端真的实现了吗？

**实现过，但此前在手机上根本跑不起来——今天已经修好，仍未真机验证。**

| 结论 | 证据 |
|---|---|
| 代码路径完整 | 手机与桌面共用 `packages/core/src/sync/*`；`_layout.tsx` 里两端都启动调度器 |
| **曾经必崩** | 手机跑在 Hermes 上，**没有 `btoa`**（WebDAV Basic 认证用）、**没有 `TextEncoder` 与 `crypto.subtle`**（S3 SigV4 用）。也就是说：坚果云/WebDAV 会在拼认证头时 `ReferenceError`，S3 会在签名时崩 |
| 已修复 | 新增 `packages/core/src/sync/crypto.ts`：纯 JS 的 SHA-256 / HMAC-SHA256 / UTF-8 编码 / Base64。S3 与 WebDAV 全部改用它；全仓再无 `btoa` / `TextEncoder` / `crypto.subtle` 的运行时依赖（grep 为证，只剩注释） |
| 修完怎么保证对 | 13 条标准向量测试：SHA-256 用 NIST 向量（空串/abc/448bit）、HMAC 用 RFC 4231 case 1&2、Base64 含中文用户名 |
| 还没验证的 | **没有真机联调**（沙箱里跑不了手机）。所以"逻辑正确"有测试兜底，"在你手机上成功"仍需实测一次 |

### 手机端能力矩阵

| 能力 | 手机端 | 说明 |
|---|---|---|
| 坚果云 / WebDAV | ✅ 就绪 | `fetch` + 纯 JS Base64 认证头；PROPFIND/MKCOL/PUT/GET |
| 自托管 HTTP | ⚠️ 需 HTTPS | Android 9+ / iOS 默认禁止明文 HTTP；自托管请配 TLS，否则连接被系统拦（不是 App 的锅） |
| S3 兼容（OSS/COS/MinIO/B2） | ✅ 就绪 | 纯 JS SigV4；每次只签几百字节，性能无压力 |
| 桌面本地文件夹 | ❌ 仅桌面 | 需要主进程 `fs`（`FilesPort`），手机没有这个概念 |
| 自动同步 | ✅ 就绪 | 启动 / 回前台 / 改动后 20s；RN 与 RNW 都支持 `AppState` |
| 设备列表 | ✅ 就绪 | 从对方 manifest 推导，不需要新文件格式 |
| 凭据加密 | ✅ 就绪（需重装 App） | 新增原生模块 `expo-secure-store`，**已发布的 2.2.0 APK 里没有**，必须重新构建 |

---

## 1. 分层结构

```
UI（更多 → 同步）           apps/mobile/src/app/(tabs)/more.tsx
  ↓ 用户动作
动作层                     platform/desktop-actions.ts（runManualSync / resolveSyncConfig / listPeerDevices）
  ↓ 调度
自动同步调度器（纯逻辑）    packages/core/src/sync/auto.ts（防抖/间隔/退避/并发）
  ↓
同步编排                    packages/core/src/sync/service.ts（syncNow）
  ↓ 端口
Provider 实现               providers.ts（WebDAV / HTTP / 文件夹） + s3.ts（SigV4）
  ↓ 基础设施
fetch / FilesPort          平台无关；签名与编码走 sync/crypto.ts（纯 JS）
```

设计取向：**core 里不出现平台 API**（无 `window`、无 `fs`、无 `crypto.subtle`），
平台差异全部收在 `platform/` 与注入的端口里。

---

## 2. 数据布局（服务端只看到这些文件）

```
<sync root>/
  devices/
    <deviceId>/
      manifest.json     # { recordId: { revision, updatedAt, deletedAt } }
      records.json      # 全量记录快照（含墓碑）
  backups/              # 云备份（时间点全量，不参与合并）
    gtd-backup-<ts>.json
```

- 没有账号、没有中心服务；`deviceId` 为 uuidv7，末 6 位用于 UI 展示。
- 每台设备只写自己的目录 → 天然避免并发写同一文件。

---

## 3. 一次同步做什么（`syncNow`）

| 步 | 动作 | 进度回调 |
|---|---|---|
| ① | 扫描本地全表（含墓碑）构建自己的 manifest | `manifest` |
| ② | 列出其他设备目录，逐个读 `manifest.json` | `pull` |
| ③ | `idsToFetch(本地, 对方)`：revision / updatedAt / deletedAt 任一不同就取 | — |
| ④ | 读对方 `records.json`，挑出待取记录 | `pull` |
| ⑤ | 按 300 条/批 `sync.applyRemote`（每批独立 immediate 事务） | `apply` |
| ⑥ | 写自己的 `manifest.json` + `records.json` | `push` |
| ⑦ | 写 `kv["sync.last"]`、`kv["sync.log"]`（条数/冲突/耗时），并把本次快照写进 `record_base`（基线） | — |

要点：
- **不信任时间窗**：不按"最近 N 分钟"拉取，避免设备时钟差导致漏同步。
- **批间释放事务**：同步中途用户照常能操作。
- **幂等**：同一批重复应用结果不变（revision 决胜 + 基线守卫）。

---

## 4. 合并规则

### 4.1 任务：字段级 3-way（v2.3）

前提：`record_base` 有基线、`base.revision < remote.revision`、两端都不是墓碑。

| 字段情况 | 结果 |
|---|---|
| 只有一端变 | 取变的那端 |
| 两端都变且值不同 | **冲突 → 保留本机（revision 高）**，字段名上报 |
| 都没变 | 取本机 |
| 本地没有该记录 / 远端 revision 更高 | 整条采用远端 |

- 合并后若与本地不同：`revision + 1`、`updatedAt = now`，并刷新基线。
- 数组/对象（`contextIds`/`tags`/`checklist`/`recurrence`）**整值**比较，不做元素合并。
- 相等判定用结构化深比较，不用 `JSON.stringify`（避免键序造成伪变更）。
- **陈旧远端守卫**：基线 revision ≥ 远端 revision 时，远端是旧副本，**不做字段合并**（否则会把新值按旧基线改回去）。

### 4.2 其它类型

项目 / 分区 / 情境 / 区域 / 模板 / 附件：**整条 LWW**（revision → updatedAt → id）。

### 4.3 墓碑

任一端是墓碑就**不做字段合并**，只走整条 LWW：被更高 revision 的编辑击败即"复活"（§8.9）。

---

## 5. 自动同步（v2.3）

| 触发 | 行为 |
|---|---|
| 应用启动 | 立即排一次（新设备第一次打开就能拉到数据） |
| 回到前台 | `AppState → active` |
| 本地改动 | store 数据切片变化；**同步自身引起的重建被忽略** |
| 合并窗口 | 20 秒（连续操作合成一次） |
| 最小间隔 | 60 秒 |
| 失败退避 | 5 分钟 × 失败次数，上限 30 分钟，退避结束自动重试 |
| 并发 | 同一时刻只跑一次 |

开关：`kv["sync.auto"]`（缺省开启；"0" = 仅手动）。自动同步失败**不弹窗打扰**，只记状态。

---

## 6. 设备可见性

| 展示 | 推导方式 |
|---|---|
| 设备标识 | `device_id` 末 6 位（不伪造设备名） |
| 记录数 | 该设备 manifest 的 key 数（含墓碑） |
| 最后活动 | manifest 里最大 `updatedAt`（比文件 mtime 可靠） |

损坏/被删的 manifest 会被跳过，不阻塞其它设备。

---

## 7. 凭据与加密

| 平台 | 存法 | 备注 |
|---|---|---|
| 桌面 | `enc:<base64>`（Electron safeStorage） | 无 safeStorage 时降级 `b64:`，UI 提示 |
| 移动 | `sec:<slot>` 指针 + 系统安全存储里的真值 | iOS Keychain / Android Keystore（`expo-secure-store`） |
| 取值 | **只有 `resolveSyncConfig()` 会把 `sec:`/`enc:` 还原成明文** | sync / 测试连接 / 设备列表 / 云备份都经它 |

顺带修掉的缺陷：此前桌面端保存时加密成 `enc:...`，同步时却把它当密码发给服务器（认证必失败）。

---

## 8. 错误分类（说人话）

| 分类 | 识别 | 文案 |
|---|---|---|
| 网络 | `ECONN/ETIMEDOUT/ENOTFOUND/fetch failed/timeout` | 网络不通：检查连接或网盘地址后重试 |
| 认证 | `401/403/unauthorized/forbidden/invalid_token` | 认证失败：账号或密码/令牌不对 |
| 路径 | `404/not found` | 路径不存在：检查同步目录是否已被删除 |
| 配额 | `ENOSPC/quota/space` | 空间不足：网盘配额已满 |
| 其它 | 兜底 | 同步失败：{原始 message} |

---

## 9. 备份（与同步的区别）

| | 同步 | 云备份 | 本地备份（桌面） |
|---|---|---|---|
| 粒度 | 记录级增量合并 | 时间点全量 | 时间点全量（`VACUUM INTO`） |
| 冲突 | 有合并规则 | 不合并，恢复时走 `import.merge`（仍 revision 决胜） | 恢复即覆盖，需重启 |
| 保留 | 每设备一份 | 按文件名累积 | 最近 7 份 |

---

## 10. 已知限制（诚实清单）

1. **未真机验证**：本文所有"就绪"都指代码与单测层面；跨设备真实联调还没做。
2. **自托管 HTTP 需 TLS**：明文 HTTP 会被 Android/iOS 拦。
3. **字段级合并只覆盖任务**；`checklist` 子项不做元素级合并。
4. **`record_base` 只增不删**：没有孤儿行清理（标量很小）。
5. **冲突只记字段名，不存对端值**：UI 能说"标题被本机覆盖"，但看不到对方写了什么。
6. **记录级 LWW 的其余类型**：两端同时改同一项目，仍会整条覆盖。
7. **首次升级后第一轮没有基线**：退化为整条 LWW，之后每轮刷新。
8. **没有端到端加密**：服务端看到的是明文 JSON，依赖 HTTPS（见 §20 不做清单）。

---

## 11. 文档索引

| 想看什么 | 去哪 |
|---|---|
| 数据布局 / Provider 契约 | `technical-reference.md` §13.1–13.2 |
| 同步流程 / 自动同步 / 设备 | §13.3 / §13.3.1 / §13.3.2 |
| 合并规则（字段级） | §13.4（13.4.1 / 13.4.2） |
| 凭据加密 | §13.5 |
| 云备份 / 本地备份 | §13.6 / §13.7 |
| 失败与错误分类 | §13.8 |
| 墓碑与复活 | §8.9 |
| 待办与不做 | §20 |
| 用户视角怎么用 | `user-feature-guide.md` §2⑩ |

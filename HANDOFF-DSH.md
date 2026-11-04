# GTD 清单 · 交接文档（交接给 DSH）

> 交接日期：2026-11-01 · 交接人：ZCode（Claude 会话）
> 读者：接手本项目的下一个 agent（DSH）或开发者
> ⚠️ **本文件只存本地（E:\工作清单app\HANDOFF-DSH.md），不推送公开仓库**——含运营与安全上下文。

---

## 0. 一句话现状

本地优先 GTD 任务清单应用，**v0.12.0 已发布**（https://github.com/czchengzhi404/gtd-app ，公开，Apache-2.0），五平台 CI 全绿（Android 4 分包 / Windows x64+arm64 合一 NSIS / macOS Intel+ARM dmg / Linux x64+arm64 AppImage / iOS 未签名 IPA+模拟器包）。**签名密钥 2026-10-31 已轮换为本机离线自签 RSA-4096**——装过 ≤v0.11.1 旧版 APK 的设备升级必须卸载重装。测试 177 项全绿，技术文档（docs/technical-reference.md）与代码同步。

## 1. 项目坐标

| 项 | 值 |
|---|---|
| 本地工作区 | `E:\工作清单app`（Git Bash 环境；shell 是 Git Bash 不是 cmd） |
| 仓库 | `czchengzhi404/gtd-app`（**已公开**），Apache-2.0 |
| 当前版本 | v0.12.0（app.json `expo.version`=0.12.0，`expo.android.versionCode`=18） |
| Monorepo | Bun workspaces（`linker="hoisted"` 已写进 bunfig.toml，勿删） |
| 包结构 | `packages/core`（全部业务逻辑，纯 TS 无 React）→ `packages/ui`（RN 组件）→ `apps/mobile`（Expo 57，web 产物即桌面渲染层）+ `apps/desktop`（Electron 壳，零业务逻辑） |
| 技术文档 | `docs/technical-reference.md`（全功能+架构，先读这个）+ `docs/architecture.md` / `docs/ui-design-system.md` / `docs/sync-providers.md` / `docs/security-audit-2026-10-25.md` |
| 本地 APK 归档 | `release-local/`（各版本 APK + keystore-archive/，见 §6） |

## 2. 快速上手

```bash
cd /e/工作清单app && bun install        # bunfig.toml 必须先于首次 install 存在（已就位）
bun test packages/core packages/ui apps/desktop/tests   # 177 项，应全绿
bun run export:web                      # Expo web 导出（桌面渲染层来源）
bun run smoke:desktop                   # Electron 冒烟（8 组断言，不弹前台）
bun run dev:mobile                      # Expo dev server
```
四包各自 `bunx tsc --noEmit`（在 packages/core、packages/ui、apps/mobile、apps/desktop 目录下分别跑）。

**改完任何功能的标准验证门**：四包 tsc + 177 测试 + export:web + smoke + 离屏截图巡检（`cd apps/desktop && bun x electron . "--shot=375x812,out.png,/<路由>"`，支持 `?dark=1&fontScale=2`）。**截图巡检必须做**——smoke 不覆盖所有路由，React #185 白屏就是靠它逮到的。

## 3. 架构速读（细读 docs/technical-reference.md）

- **命令架构**：所有写操作走具名命令 `{op, payload}`（zod 校验、immediate 事务、可结构化克隆——有专项测试）。UI 不直接写 SQL。
- **store**：core 是 zustand/vanilla + 纯 selector；React 绑定只在 ui 的 `useAppStore`（内套 useShallow）。
  ⚠️ **返回新对象的 selector 不能直接喂 useAppStore/useShallow**（渲染期死循环 React #185 整页白屏）——派生结构用 useMemo（先例：`groupProjectsByArea`，core 里已加警告注释）。
- **文本**：`AppText` 是唯一文本原语（字号/行高锁死、allowFontScaling=false）——根治小米/MIUI 大字体错乱的三层防御之一（另两层：`installFontScaleOverride` + CI 注入 MainActivity fontScale=1.0，都在 workflow 里，别动）。
- **UI 纪律**（ui-ux-pro-max）：Accessibility→Touch→Performance→Layout→Typography→Animation；断点 375/768/1024/1440；触控 ≥44px；对比度 ≥4.5:1（有测试）。
- **平台差异**只允许在 `packages/ui/src/platform/*.web.ts|*.native.ts` 等少量文件。
- **SQL 纪律**：内联静态字面量 + 参数绑定，零拼接（安全 hook + review 双查）。

## 4. 开发环境须知（这个 Windows 机器的特殊性）

1. **无 JDK / 无 Android SDK**：本地不能构建 APK、不能跑 keytool/emulator。Android 构建全在 CI。密钥用 `python cryptography` 库生成（已 pip install）。
2. **Shell 是 Git Bash**：路径写法 `/e/工作清单app`；`python` 是 Windows 版（`/tmp` 对它不可见，临时文件用 Windows 可见路径或项目内）。
3. **Mimosa 安全 hook（重要）**：
   - 会拦截 Bash 直接写源码/配置（用 Write/Edit 工具代替）；
   - 会拦 SQL 拼接、命令注入样式的脚本（变量拼命令串）；
   - 会拦把凭据写进代码；gh token 从 `gh auth` 读取，别写进文件；
   - 被拦 ≠ 做错了，换 Write/Edit 或调整写法即可。
4. **网络**：github.com 直连时断时续；**代理 `http://127.0.0.1:7897` 时有时无**。gh 大上传偶发瞬时 401（重试即愈）；`POST git/trees` 偶发 `GitRPC::BadObjectState`（同样重试）。发布脚本全部内置 3 次重试。
5. **gh 认证**：已登录，scopes 现含 `repo + workflow`（workflow scope 是 2026-10-31 设备流追加的，gh 修改 `.github/workflows/*` 必需；过期/丢失时 `HTTPS_PROXY=http://127.0.0.1:7897 gh auth refresh -h github.com -s workflow` 重新走设备流）。
6. **全局 git 重写**：`url.https://kkgithub.com/.insteadOf https://github.com/`（只读镜像）。git 操作 GitHub 时用恒等覆盖：
   `git -c url."https://github.com/czchengzhi404/".insteadOf="https://github.com/czchengzhi404/" -c credential.helper="!gh auth git-credential" -c http.proxy=http://127.0.0.1:7897 <cmd>`
7. **本地 .git 有旧历史**（含已轮换的旧签名钥，仅本机，无外泄渠道）。**不要把本地 git push 到任何地方**；与远程同步一律走 GitHub API（见 §5）。介意可重初始化本地 git。

## 5. 发布 SOP（v0.12.0 实测流程，照抄即可）

```
① 版本 bump（JSON 解析式写，禁 sed）：
   apps/mobile/package.json + apps/desktop/package.json → version
   apps/mobile/app.json → expo.version 和 expo.android.versionCode 两层都要写！
   （只写 root "version" 会让 APK versionName 停在旧版——v0.12.0 首跑踩过，CI 现有守卫会红）
② 本地验证门（§2）
③ API 推提交：Python heredoc + gh api（blob(base64,含401重试)→tree(含BadObjectState重试)→commit→PATCH refs/heads/main）
   · 本地 git status --porcelain 枚举变更（含 untracked）；"D" 条目需对照远程基树，路径不存在则跳过
   · 本地 git 未 pull（远程领先），heredoc 从远程 HEAD 取 base_tree，与本地 .git 无关
④ 打 tag：POST git/tags（annotated）+ POST git/refs → 触发 CI（五 job）
⑤ 等 CI：Android ~35-40min，其余 2-10min；macOS dmg job needs win+linux 串行
⑥ 核对：release（gh api releases 列表找 tag——**草稿用按 tag 查会 404**）资产时间戳全部来自本次 run
⑦ PATCH releases/<id> draft=false + 写 release notes（中文，含下载表）
⑧ APK 抽包下载：curl -x http://127.0.0.1:7897 -C - 断点续传 + zipfile 全量 testzip() CRC
   （gh release download 会撞 Fastly 僵死；**杀干净所有 curl 后只保留一条下载命令**——两条并发写同一文件会互相追加损坏）
```

**出错的恢复模式**：资产/构建出错 → 删该 release 全部资产 → 修 workflow → `gh workflow run release.yml --ref main`（workflow_dispatch）重跑。所有 gh release 上传步骤已内置 **TAG 推导**（`GITHUB_REF_NAME` 是 `main` 时从 app.json expo.version 推 `v<version>`），dispatch 会回到正确 release。

## 6. 签名密钥（最敏感的一项）

- **当前密钥**：本机离线自签 **RSA-4096**（python cryptography 生成 PKCS12，CN=GTD List Release，30 年，alias=`gtd`），密码 32 位随机。
- **存放**：GitHub Secrets `ANDROID_KEYSTORE_BASE64` + `ANDROID_KEYSTORE_PASSWORD`（gh secret set 已写入，API 读不回）。CI 的 "Restore signing keystore from Secrets" 步骤 base64 -d 还原到 `apps/mobile/keys/gtd-release.p12`（该路径被 .gitignore 全量忽略，勿恢复 `!keys/*.p12` 例外）。
- **本地**：`apps/mobile/keys/keystore.env`（gitignored）= 新密码；本地 p12 文件在盘上但已 untracked。
- **旧钥（RSA-2048，v0.11.1 及之前用）**：仅存本机 `release-local/keystore-archive/`（旧 p12 + 旧密码），供旧签名版本紧急更新；**已从 GitHub 全部 git 历史抹除**（git filter-repo，镜像备份在 `C:\Users\12760\gtd-history-rewrite\gtd-app.git`）。
- **绝对禁止**：把任何密钥/密码写进仓库文件、README、commit message、issue。密钥只存在于 Secrets + 本机归档。
- v0.12.0 CI 已实证新钥签名（apksigner 输出 CN=GTD List Release）。

## 7. 已知坑速查（全部真实踩过）

| 坑 | 正确做法 |
|---|---|
| `ls 目录通配符` 列出的是目录**内容** | 找路径一律 `find -maxdepth 1 -name`（iOS workspace 曾因此拿到 contents.xcworkspacedata） |
| useShallow + 新对象 selector → React #185 白屏 | 派生结构 useMemo；selector 只返回元素稳定数组 |
| expo prebuild 的版本名来自 `expo.version` | bump 必须两层（root + expo） |
| workflow_dispatch 时 GITHUB_REF_NAME=main | release 上传步骤用 TAG 推导（已内置，照抄模式） |
| RNW 无 Alert.alert；Android 无 window.prompt | 用 ui 的 showPrompt/showConfirm（PromptHost 挂根布局） |
| 任务行/FilterBar 的 chip 前缀 | Chip `prefix` 参数：缺省=@（情境）、null=无、"#'=标签 |
| 修改 workflow 文件 | Contents API + workflow scope（正常 gh 现已具备） |
| 大 JSON body 经 curl/代理会损坏 | 一律 gh api --input 临时文件 |
| Android `git rm --cached` 后文件仍在盘 | 本地构建需要它；已 gitignore，别恢复跟踪 |

## 8. 遗留事项 / 待办（按优先级）

1. **批量/滑动/撤销的用户验收**：v0.12.0 的新交互（长按多选、左右滑、排序模式、命令面板 Ctrl+K、More 卡片化、回收站、语法速查）尚未收到用户真机反馈——小米 15 是主要测试机。
2. **P2 未做**（此前评估"有余力再做"）：Windows arm64 NSIS 实机验证（CI 已产出合一安装器）；Linux arm64 AppImage 实测；iOS TrollStore 实测；SQLCipher 全库加密；时间块/日历同步/艾森豪威尔矩阵/统计面板/导入器/Markdown-ICS 导出（原 P2 清单）。
3. **改名决策**：用户决定**暂不改名**。"GTD" 是 David Allen 注册商标，应用主品牌用 GTD 打头是灰色地带；若项目长大，建议改独特名 + 描述性引用（README 需同步）。
4. **macOS 公证**：dmg 未签名（右键→打开可绕）；要免提示需 Apple Developer + notarize 配置（electron-builder.yml 有注释位）。
5. **自动更新**：electron-updater 基础项在配置里，公开仓库后理论上可用，未实测。
6. **旧版本升级链**：v0.11.1→v0.12.0 需卸载重装（已换钥）。若旧钥归档还在，理论上可给旧签名链发一版过渡包——默认不做。
7. **本地 .git 旧历史**含旧钥（仅本机）——见 §4.7。
8. **iOS 实机**：所有 iOS 构建未在真机验证过（无 Apple 账号/设备）；simulator 包供有 Mac 的贡献者。

## 9. 功能清单（详版见 docs/technical-reference.md §5）

快速添加（28 种语法，中英）；收集/理清四状态 + defer 开始日期；任务（优先级/到期/重复六种 freq/清单/标签/Markdown 笔记/附件/星标）；项目（顺序/并行/分区/**区域分组**/回顾周期）；情境+标签筛选 + **保存的筛选**；视图（列表/看板/日历/即将/Timeline/专注）；交互（长按多选批量、左滑完成右滑延后、拖拽排序、桌面右键菜单）；**命令面板 Ctrl+K**；番茄钟（绑星标任务）；六步每周回顾（含到期红点）；完成记录 + **回收站**；双通道通知（每日概览+定时 5min 窗口）；撤销系统；同步（WebDAV/S3/自托管/本地文件夹 + revision 合并 + 墓碑 90 天自动压缩）+ 云备份 + 本地 VACUUM 备份；safeStorage 密码加密；中英双语 + 日夜主题 + 内置霞鹜文楷（默认系统字体，懒加载）。

## 10. 测试地图

| 文件 | 覆盖 |
|---|---|
| `packages/core/src/__tests__/doc-conformance.test.ts` | 技术文档语法表/重复语义/筛选逐条符合性（33 项）——**改解析器/文档必须同步** |
| `.../adopted-optimizations.test.ts` | bulk-ops 规划/解析器语义修正回归 |
| `.../p0-features.test.ts` / `p1-features.test.ts` | defer/即将/提醒/回顾统计/标签/区域等 |
| `.../ipc-serializable.test.ts` | 全命令 payload structuredClone 纪律 |
| `packages/ui/src/__tests__/` | 对比度（WCAG）/a11y 静态审计/fuzzyScore |
| `apps/desktop/tests/commands.test.ts` | 真实 SQLite 命令层（含回收站/墓碑压缩/无到期日重复推进） |
| `apps/desktop/tests/sync.test.ts` / `sigv4.test.ts` | 同步合并/S3 签名 |

改 `quick-add.ts`、`recurrence.ts`、`selectors.ts` 时先跑 doc-conformance——文档与实现在此互相锁死。

## 11. 用户偏好（沟通与决策风格）

- 中文沟通；计划要先确认再动手；每模块完成后双端验证并列改动文件清单。
- 发布是明确逐次授权的（"发布"= 一次完整 tag→CI→资产核对→notes→下载校验循环）。
- 安全敏感（主动做过供应链自查、密钥轮换、转公开前审计）；宁可保守。
- 用户手机：小米 15（HyperOS，大字体曾出过问题——已三层防御）；主要装机途径是 Releases 直接下 APK。
- 名字：应用暂名"GTD 清单"，已知商标灰色地带，用户拍板暂不改。

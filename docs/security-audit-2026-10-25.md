# 安全自查报告（2026-10-25）

对照"史上最黑暗 48 小时"供应链攻击潮（澎湃/新智元梳理）的攻击面逐项自查。

## 结论

**未发现可被利用的漏洞；新闻点名的攻击面全部有对应检查或加固。自查过程中发现并修复了一个 CI 配置缺陷（签名库被模板 gitignore 误伤）。**

## 逐项对照

| 攻击向量（新闻） | 本项目暴露面 | 检查结果 | 处置 |
|---|---|---|---|
| npm 包感染（tensorlake/SubQuery） | Bun workspace，716 依赖 | 官方 advisory 库全量审计：点名包 0 命中；命中 3 条全部位于 Expo 上游工具链（见下） | 定级与跟踪（下表） |
| 恶意 GitHub 工作流（GhostAction） | release.yml ×1 | 5 个 action 全部第一方官方 org；无 pull_request_target；无不可信输入进 run 块 | **已加固：全部 action 锁定 commit SHA**（防 tag 劫持） |
| 客户机密/密钥泄露（Railway/OpenCode/ConnectWise） | GitHub 令牌 ×2、签名密钥 ×1、CI Secret ×1 | git **全历史**扫描 0 命中；源码硬编码凭据 grep 0 命中；令牌仅存本地 gitignored 文件与系统 keyring；keystore 密码在 GitHub Secrets | 无需处置；建议项见下 |
| 官方二进制植入后门（OVHcloud CLI） | Electron 二进制下载 | CI 原走 npmmirror 镜像（阿里官方，无校验链） | **已加固：CI 移除镜像，runner 直连官方源 + @electron/get 内置 SHA 校验** |
| Node.js 漏洞 | Electron 内嵌 Node 26.3.0；本机 Node 24.21 | 均为对应大版本最新 patch | 跟随 Electron 常规升级 |
| CA 密钥泄露（eMudhra） | 无 Tailscale/该 CA 依赖 | 不适用 | — |
| PHP 双 9.2 / PyPI / Docker 恶意件 | 无 PHP/Python(运行时)/Docker 依赖 | 不适用 | — |

## 审计命中的 3 条（全部为 Expo 传递依赖，`bun audit fix` 确认上游修复版未发布）

| 依赖 | 等级 | 位置 | 实际风险定级 | 理由 |
|---|---|---|---|---|
| node-forge 1.4.0 | high | expo > @expo/cli | **低** | 开发工具链内部；本地证书生成用途，无对抗性验签场景；修复版发布后随 expo 升级 |
| zod 3.25.76 | high | expo > @expo/cli | **低** | CLI 工具校验本地输入；我们的直接依赖 zod 4.6.7 已含修复 |
| decode-uri-component 0.2.2 | moderate | expo-router > query-string（进运行时包） | **低** | 需应用解析攻击者构造的 URI；本应用无外部 deep link 输入面；修复需 query-string@9（expo-router 钉 v7） |

## 自查中发现并修复的缺陷

- **Expo 模板 `.gitignore` 的 `*.p12` 规则把签名密钥库挡在库外** → CI Android 签名必然失败（构建前发现，未污染发版）。已白名单 `!keys/*.p12` 并重触发 v0.2.0 构建。
- 上述两项加固（SHA pinning、去镜像）已随 main 推送，自下个 tag 生效。

## 建议项（由所有者决定）

1. `gh auth refresh` 轮换 gh CLI 长期令牌（新闻通用建议；本次自查未发现泄露迹象）。
2. 关注 Expo 新版本：zod / node-forge 修复进入上游后升级 `expo ~57.x`。
3. 仓库若转公开，先迁移 Android 签名密钥管理（现随私有库保存）。

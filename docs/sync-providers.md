# 同步接入指南：网盘与云存储

本应用的同步功能基于 WebDAV 协议 + S3 兼容协议。只要你的网盘支持其中一种，就能作为同步后端。

## 快速对照表

| 服务 | 协议 | 难度 | 免费额度 | 备注 |
|---|---|---|---|---|
| **坚果云** | WebDAV（原生） | ⭐ 最简单 | 免费 1GB/月上传，3GB/月下载 | 国内唯一原生支持 WebDAV 的主流网盘 |
| **群晖 NAS** | WebDAV（套件） | ⭐ | 取决于硬盘 | 需在 DSM 安装 WebDAV Server 套件 |
| **威联通 NAS** | WebDAV（内置） | ⭐ | 取决于硬盘 | File Station 自带 |
| **Nextcloud** | WebDAV（原生） | ⭐ | 自建无限 | ownCloud 同理 |
| **Seafile** | WebDAV（Pro 版） | ⭐⭐ | 自建无限 | 社区版需开启 WebDAV |
| **Alist 桥接** | WebDAV（自建桥） | ⭐⭐ | 跟随底层网盘 | 可桥接百度网盘/阿里云盘/OneDrive 等 30+ 种 |
| **InfiniCLOUD** | WebDAV（原生） | ⭐ | 免费 20GB | 日本服务，国内可直连 |
| **Fastmail** | WebDAV（原生） | ⭐ | 免费 2GB | 国际服务 |
| **阿里云 OSS** | S3 兼容 | ⭐⭐ | 按量付费 | 需开通 OSS + AccessKey |
| **腾讯云 COS** | S3 兼容 | ⭐⭐ | 按量付费 | 需开通 COS + SecretId/Key |
| **MinIO** | S3 兼容 | ⭐⭐ | 自建无限 | 私有部署 |
| 百度网盘 | ❌ 无 WebDAV | — | — | 可通过 Alist 桥接 |
| 阿里云盘 | ❌ 无 WebDAV | — | — | 可通过 Alist 桥接 |
| OneDrive | ❌ 无 WebDAV | — | — | 可通过 Alist 桥接 |
| Google Drive | ❌ 无 WebDAV | — | — | 可通过 Alist 桥接 |

---

## 一、坚果云（推荐——国内用户首选）

坚果云是国内唯一原生支持 WebDAV 的主流网盘，免安装客户端，跨平台。

### 设置步骤

1. 登录 [坚果云网页版](https://www.jianguoyun.com)
2. 右上角用户名 → **安全选项**
3. 底部 **第三方应用管理** → **添加应用密码**
4. 输入名称（如"GTD 清单"），生成一个**应用密码**（不是登录密码）
5. 在本应用"更多 → 同步"中填入：
   - **服务端**：`https://dav.jianguoyun.com/dav/`（已预填）
   - **用户名**：你的坚果云注册邮箱
   - **密码**：刚才生成的**应用密码**（不是网页登录密码）

### 注意事项

- 免费版每月上传 1GB / 下载 3GB，同步个人任务数据绰绰有余（每次同步通常只有几十 KB）
- 建议在坚果云中创建一个专用文件夹（如 `GTD-Sync`），然后在服务端地址末尾追加 `/GTD-Sync`
- 应用密码可以随时在坚果云安全选项中吊销

---

## 二、NAS（群晖 / 威联通）

### 群晖 DSM

1. **套件中心** → 安装 **WebDAV Server**
2. 打开 WebDAV Server → 启用 **HTTP** 或 **HTTPS** 端口（默认 5005/5006）
3. 在本应用中填入：
   - **服务端**：`http://你的NAS地址:5005/`
   - **用户名** / **密码**：DSM 的账号密码

### 威联通 QTS

1. **控制台** → **网络服务** → **Web 服务器** → 启用 WebDAV
2. 填入 `http://你的NAS地址:8080/` + QTS 账号

### 建议

- 如果 NAS 仅在内网使用，同步只在家庭/办公网络内生效。外网使用需要配置 DDNS + 端口转发，或使用群晖的 QuickConnect（但 QuickConnect 不走标准 WebDAV 路径，需直接用 DDNS）。
- 建议启用 HTTPS（自签名证书也可以，至少加密传输）。

---

## 三、Nextcloud / ownCloud / Seafile

### Nextcloud（推荐——自建云盘首选）

1. Nextcloud 原生支持 WebDAV，无需额外配置
2. 服务端地址格式：`https://你的域名/remote.php/dav/files/你的用户名/`
3. 用户名密码为 Nextcloud 账号（如启用了两步验证，需使用应用密码）

### Seafile

- 社区版默认不启用 WebDAV，需在 `seahub_settings.py` 中添加 `ENABLE_WEBDAV = True`
- 服务端地址：`https://你的域名/seafdav/`

---

## 四、Alist 桥接（万能方案）

[Alist](https://alist.nn.ci) 是一个开源的文件列表程序，支持将 30+ 种网盘（百度网盘、阿里云盘、OneDrive、Google Drive、S3、本地磁盘等）统一挂载为 WebDAV 服务。

### 适用场景

- 你想用**百度网盘 / 阿里云盘 / OneDrive** 等不支持 WebDAV 的网盘作为同步后端
- 你不想在每个设备上安装各网盘的客户端

### 部署方式

**方案 A：本地运行（最简单）**

```bash
# Windows
curl -LO https://github.com/alist-org/alist/releases/latest/download/alist-windows-amd64.zip
# 解压后运行
alist server
# 首次运行会显示管理员密码
```

**方案 B：Docker（NAS/VPS）**

```bash
docker run -d --name alist -p 5244:5244 -v /your/data:/opt/alist/data alist/alist:latest
```

### 配置

1. 打开 Alist 管理页面（默认 `http://localhost:5244/@manage`）
2. **存储** → **添加存储** → 选择你的网盘（百度网盘 / 阿里云盘 Open 等）
3. 按提示完成 OAuth 授权
4. 在本应用中填入：
   - **服务端**：`http://localhost:5244/dav/`（或你的 Alist 部署地址）
   - **用户名**：`admin`（Alist 管理员账号）
   - **密码**：Alist 管理员密码

### 注意事项

- Alist 桥接层的上传/下载速度取决于底层网盘的 API 限速
- 百度网盘 API 有频率限制，频繁同步可能触发限速
- 阿里云盘（Open API）单文件上限 5GB，每天有上传/下载配额
- 建议将同步目录设为 Alist 中的一个独立文件夹（如 `/GTD-Sync`），不要挂在根目录

---

## 五、InfiniCLOUD（原 TeraCLOUD）

日本网盘服务，原生支持 WebDAV，免费 20GB，国内可直连（无需代理）。

1. 注册 [InfiniCLOUD](https://infinicloud.net)
2. 首页 → ** connection settings** → 确认 WebDAV URL
3. 在本应用中填入 WebDAV URL + 账号密码

---

## 六、Fastmail

国际邮箱/云存储服务，文件存储原生支持 WebDAV。

1. 登录 Fastmail → **Settings → Files**
2. 服务端地址：`https://webdav.fastmail.com/files/`
3. 用户名：Fastmail 邮箱；密码：应用专用密码

---

## 七、S3 兼容存储

如果你有阿里云 OSS、腾讯云 COS、MinIO 或 AWS S3 的账号，可以使用 S3 兼容模式。相比 WebDAV，S3 有更好的并发性能和更强的数据一致性保证。

### 阿里云 OSS

1. 登录 [OSS 控制台](https://oss.console.aliyun.com) → 创建 Bucket
2. **RAM 访问控制** → 创建子账号 → 授予 `AliyunOSSFullAccess` 权限
3. 获取 AccessKeyId 和 AccessKeySecret
4. 在本应用中填入：
   - **服务端**：`https://oss-cn-hangzhou.aliyuncs.com`（按你的 Bucket 所在选择地域）
   - **存储桶**：你的 Bucket 名称
   - **地域**：`oss-cn-hangzhou`
   - **AccessKeyId / SecretAccessKey**：子账号的密钥

### 腾讯云 COS

1. 创建 Bucket → 获取 SecretId / SecretKey
2. 服务端：`https://cos.ap-guangzhou.myqcloud.com`（按地域）
3. 其余同上

### MinIO

1. 部署 MinIO → 创建 Access Key
2. 服务端：`http://你的MinIO地址:9000`

### 注意事项

- S3 模式使用 **路径风格寻址**（path-style），兼容所有 S3 兼容服务
- AWS SigV4 签名基于 Web Crypto API，在浏览器和 Node 环境均可用
- **AccessKey/SecretKey 是敏感凭据**，仅存储在本设备（不参与同步），请勿分享

---

## 八、不支持 WebDAV 的网盘

| 网盘 | 原因 | 替代方案 |
|---|---|---|
| 百度网盘 | 开放平台 API 仅限合作应用 | Alist 桥接 |
| 阿里云盘 | Open API 需企业认证 + 审核 | Alist 桥接 |
| OneDrive | WebDAV 已于 2019 年弃用 | Alist 桥接 |
| Google Drive | 无 WebDAV，REST API 需 OAuth | Alist 桥接 |
| 腾讯微云 | 无公开第三方 API | 暂无方案 |
| Dropbox | WebDAV 已弃用 | 需 Dropbox API（OAuth2） |

---

## 九、安全建议

1. **使用应用密码**而非主密码（坚果云/Fastmail/Nextcloud 都支持）
2. **启用 HTTPS**——明文 HTTP 传输的凭据和任务数据可被中间人截获
3. **同步目录独立**——不要把同步路径指向网盘根目录，避免与其他文件冲突
4. **定期更换应用密码**——尤其是在设备丢失后
5. **AccessKey 权限最小化**——S3 子账号只授予目标 Bucket 的读写权限，不要用主账号密钥
6. **备份**——网盘只是同步通道，不是备份。建议配合应用内的本地自动备份功能使用

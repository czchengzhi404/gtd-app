# v2.5.9 · 修复「同步已启用」开关不生效

## 问题

同步页的开关显示「同步已启用」（绿色、打勾），但点「立即同步」提示：

```
同步未启用：先在下方配置并开启
```

同一个页面，上面说已启用、下面说未启用。

## 原因

开关只改了**本地 state**，没有落库：

```tsx
onPress={() => update({ enabled: !config.enabled })}   // 只 setConfig
```

而同步服务是从数据库读配置的：

```ts
const config = await getSyncConfig(executor);   // enabled 仍是 false
if (!config.enabled) return { ok: false, message: t("sync.notEnabled") };
```

所以必须再点一次「保存配置」才真正生效——但界面上没有任何提示告诉你这一点。

## 修复

1. **开关切换立即落库**：抽出 `persist(next, silent)`，开关 `onPress` 里直接调它，静默保存（不弹 toast，避免每次切换都弹）
2. **同步前自动保存**：`onSyncNow` 开头检查 `dirty`，有未保存改动就先落库再同步
3. 表单改动会置 `dirty`，保存成功后清除

## 顺带提醒：坚果云要用「应用密码」

坚果云 WebDAV 不接受登录密码，必须用独立的应用密码：

1. 网页登录坚果云 → 右上角账户 → **账户信息**
2. **安全选项** → **添加应用** → 生成一个应用密码
3. 把这个密码填到 GTD 的「密码」框

服务器地址填 `https://dav.jianguoyun.com/dav/`（注意结尾的 `/dav/`）。

## 升级

- versionCode 30 → 31，同一签名

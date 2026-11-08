# v2.7.0 · 移动端文件夹同步（SAF）

## 做了什么

移动端的「本地文件夹」同步之前是桌面专属（按钮置灰、`createProvider` 直接抛错）。现在可用。

## 实现思路：复用桌面逻辑，而不是另写一套

`createFolderProvider` 只依赖 `FilesPort` 的四个方法：

```ts
interface FilesPort {
  readFile(path): Promise<string | null>;
  writeFile(path, content): Promise<void>;
  listDir(path): Promise<string[]>;
  mkdir(path): Promise<void>;
}
```

路径是普通字符串（`<root>/devices/<id>/manifest.json`）。移动端拿到的是 SAF 的 `content://` 目录 URI，不能当路径拼——但只要把「字符串路径 → SAF URI」的映射做出来，就能**直接复用桌面的同步逻辑**。

于是新增 `SafFilesPort`：剥掉根 URI 前缀，剩下的按 `/` 分段，逐段用 `makeDirectoryAsync` 建目录（带 URI 缓存），最后一段当文件名。

**结果：目录结构与桌面完全一致**（`devices/<deviceId>/manifest.json` + `records.json`），手机和桌面可以指向同一个文件夹。

## SAF 的三个坑

| 坑 | 处理 |
|---|---|
| **写文件不能覆盖** | 先 `deleteAsync` 再 `createFileAsync`，否则会失败或产生 `xxx (1).json` |
| **目录只能一层层建** | `makeDirectoryAsync(parent, name)` 只建一层且返回新 URI，用相对路径 → URI 的 Map 缓存 |
| **`readDirectoryAsync` 返回的是子项 URI 列表** | 不是文件名，要从 URI 末段解码取名字 |

## 使用方式

同步页 → 选「本地文件夹」→ 点「选择文件夹」→ 系统文件选择器里挑一个目录 → 保存配置 → 立即同步。

首次会请求目录访问权限，授权后该目录下的 `devices/` 由应用自动创建。

## 限制

- **只在移动端之间、或与桌面端互相同步时有效**：两端都必须指向同一个物理文件夹（比如通过 Syncthing、或同一台机器的共享目录）
- **SAF 授权持久性**：Android 的目录授权在应用被清除数据后会失效，需要重新选目录
- **未在真机验证**：模拟器上没法完成系统文件夹授权流程，我只验证了代码路径和类型

## 升级

- versionCode 33 → 34，同一签名

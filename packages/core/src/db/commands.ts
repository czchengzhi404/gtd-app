/**
 * 兼容转发层：命令实现已拆分到 ./commands/ 目录。
 *
 * 保留本文件是为了让既有 import（store/app-store.ts、platform/ipc-executor.ts、
 * apps/desktop 主进程等）继续使用 `db/commands`，不需要任何调用方改动。
 * 新代码请直接从 ./commands/index 导入（或继续用本转发，二者等价）。
 */
export * from "./commands/index";

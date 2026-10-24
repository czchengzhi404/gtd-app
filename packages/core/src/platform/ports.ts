import type { CommandMap, CommandOp, CommandResult } from "../models/commands";
import type { SqliteExecutor } from "./executor";

/**
 * 平台端口单例。app 启动时注入（mobile 注入 expo-sqlite 实现；
 * desktop 渲染进程注入 IPC 实现），core 其余代码只经此取用。
 */

let sqliteExecutor: SqliteExecutor | null = null;
let commandPort: CommandPort | null = null;
let notificationsPort: NotificationsPort | null = null;
let filesPort: FilesPort | null = null;

/** 系统通知端口：desktop=主进程 Notification（点击回传 notification:click）；
 *  mobile=expo-notifications 本地通知（阶段三接入） */
export interface NotificationPayload {
  title: string;
  body: string;
  /** 点击通知后跳转的任务 id */
  taskId?: string;
}

export interface NotificationsPort {
  show(payload: NotificationPayload): Promise<void>;
}

/** 文件系统端口（限定根目录）：桌面文件夹同步 / 导入导出用，主进程执行 */
export interface FilesPort {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
}

/**
 * 命令端口：渲染进程唯一的写路径。
 * - mobile 实现：本地 executeCommand（事务在 expo-sqlite 内）
 * - desktop 实现：IPC `command(op, payload)`（事务在主进程 better-sqlite3 内）
 * 两侧事务语义一致（immediate），由 SqliteExecutor 端口契约保证。
 */
export interface CommandPort {
  dispatch<K extends CommandOp>(op: K, payload: CommandMap[K]): Promise<CommandResult>;
}

export function setSqliteExecutor(executor: SqliteExecutor): void {
  sqliteExecutor = executor;
}

export function getSqliteExecutor(): SqliteExecutor {
  if (!sqliteExecutor) {
    throw new Error("SqliteExecutor 未注入：请先调用 setSqliteExecutor");
  }
  return sqliteExecutor;
}

export function setCommandPort(port: CommandPort): void {
  commandPort = port;
}

export function getCommandPort(): CommandPort {
  if (!commandPort) {
    throw new Error("CommandPort 未注入：请先调用 setCommandPort");
  }
  return commandPort;
}

export function setNotificationsPort(port: NotificationsPort): void {
  notificationsPort = port;
}

export function getNotificationsPort(): NotificationsPort | null {
  return notificationsPort;
}

export function setFilesPort(port: FilesPort): void {
  filesPort = port;
}

export function getFilesPort(): FilesPort | null {
  return filesPort;
}

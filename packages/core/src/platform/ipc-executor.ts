import type { CommandMap, CommandOp, CommandResult } from "../models/commands";
import type { SqliteExecutor, TransactionMode } from "./executor";
import type { CommandPort } from "./ports";

/**
 * 桌面渲染进程实现：经 preload 暴露的 window.gtd 通道。
 * - query → IPC 只读查询（主进程校验 SELECT-only）
 * - run/transaction → 不允许（写路径唯一入口是 command；事务在主进程）
 * - command() 经 CommandPort 封装
 *
 * 窗口类型声明由 apps/desktop 的 preload.d.ts 提供（globalThis.gtd）。
 */

interface GtdBridge {
  command(op: string, payload: unknown): Promise<CommandResult>;
  query(sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

function bridge(): GtdBridge {
  const gtd = (globalThis as { gtd?: GtdBridge }).gtd;
  if (!gtd) {
    throw new Error("window.gtd 不存在：不在 Electron 环境中，应注入本地 executor");
  }
  return gtd;
}

export function isElectronRenderer(): boolean {
  return typeof globalThis !== "undefined" && (globalThis as { gtd?: unknown }).gtd != null;
}

export function createIpcExecutor(): SqliteExecutor {
  return {
    query: async <T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) => {
      const rows = await bridge().query(sql, params ?? []);
      return rows as T[];
    },
    run: async () => {
      throw new Error("渲染进程不直接执行写 SQL；写路径统一走 command(op, payload)");
    },
    transaction: async <T>(
      _fn: (tx: SqliteExecutor) => Promise<T>,
      _mode: TransactionMode,
    ): Promise<T> => {
      throw new Error("渲染进程不执行本地事务；写路径统一走 command(op, payload)");
    },
  };
}

export function createIpcCommandPort(): CommandPort {
  return {
    dispatch: async <K extends CommandOp>(op: K, payload: CommandMap[K]): Promise<CommandResult> => {
      return bridge().command(op, payload);
    },
  };
}

import { ZodError } from "zod";

/**
 * 领域错误模型（纯数据，无 React / 无数据库依赖）。
 *
 * 约定：
 * - 命令层（db/commands）是唯一把内部异常翻译成 AppError 的边界；
 * - message 始终保留原始可读信息（IPC 层据此展示），details 只放可结构化
 *   克隆的纯数据，禁止塞 Error 实例 / 函数 / 类实例；
 * - code 是稳定的机器可读分类，UI 可据此决定文案与重试策略。
 */

export type AppErrorCode =
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "storage_failed"
  | "network_failed"
  | "forbidden"
  | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    // 保持原型链（target=ES2022 下 class 继承 Error 已正确，但跨编译目标更稳）
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function inferCode(message: string): AppErrorCode {
  if (/(?:^|\s)not found(?:\s|:|$)/i.test(message) || /不存在/.test(message)) {
    return "not_found";
  }
  if (/constraint|SQLITE_|database|disk|storage|ENOSPC|EACCES|EROFS/i.test(message)) {
    return "storage_failed";
  }
  if (/network|fetch|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return "network_failed";
  }
  if (/forbidden|permission denied|无权|禁止/i.test(message)) {
    return "forbidden";
  }
  if (/conflict|冲突/i.test(message)) {
    return "conflict";
  }
  return "unknown";
}

/**
 * 任意抛出物 → AppError。
 * - AppError 原样返回（不重复包装、不丢 details）；
 * - ZodError → validation_failed，details 保留 issues 摘要；
 * - 其他 Error → 按 message 做有限分类，message 原样保留；
 * - 非 Error → String(err) 作为 message，原值放 details。
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
    const summary = issues
      .map((issue) => `${issue.path.length > 0 ? issue.path : "(payload)"}: ${issue.message}`)
      .join("; ");
    return new AppError(
      "validation_failed",
      summary.length > 0 ? `参数校验失败: ${summary}` : err.message,
      { issues, originalMessage: err.message },
    );
  }

  if (err instanceof Error) {
    const details: Record<string, unknown> = { name: err.name };
    if (err.cause !== undefined) {
      details.cause = err.cause instanceof Error ? err.cause.message : String(err.cause);
    }
    return new AppError(inferCode(err.message), err.message, details);
  }

  const message = String(err);
  return new AppError("unknown", message, { value: message });
}

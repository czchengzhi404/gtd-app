/**
 * SQLite 执行器端口。
 *
 * 实现方：
 * - 桌面端：Electron 主进程 better-sqlite3（N-API ≥13.0.3；备选 node:sqlite）；
 *   渲染进程经 IPC `command(op, payload)` 调用，命令在主进程执行。
 * - 移动端：expo-sqlite，在渲染进程直接实现本接口。
 *
 * 事务语义（SqliteExecutor 端口契约，所有实现必须遵守）：
 * - 所有写事务——用户命令与 sync.applyRemote——统一 `immediate`
 *   （BEGIN IMMEDIATE，事务开始即获取写锁，防止前台用户操作与后台同步交错）；
 * - 只读查询不使用事务，或使用 `deferred`；
 * - sync.applyRemote 每批一个独立 immediate 事务（默认 200–500 条/批，
 *   批间显式释放），绝不与用户命令共享事务边界。
 */
export type TransactionMode = "immediate" | "deferred";

export type SqliteRow = Record<string, unknown>;

export interface SqliteRunResult {
  changes: number;
}

export interface SqliteExecutor {
  /** 只读查询。SQL 一律参数绑定，禁止拼接外部输入。 */
  query<T extends SqliteRow = SqliteRow>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** 单条写语句（命令内部使用；独立调用也必须处于事务内或等价保证下） */
  run(sql: string, params?: readonly unknown[]): Promise<SqliteRunResult>;
  /**
   * 事务边界 = 命令边界。mode 必须显式传入；写命令传 "immediate"。
   * 桌面端由主进程在命令分发层统一包裹；移动端由 expo-sqlite 实现包裹。
   */
  transaction<T>(fn: (tx: SqliteExecutor) => Promise<T>, mode: TransactionMode): Promise<T>;
}

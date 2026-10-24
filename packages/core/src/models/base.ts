/**
 * 所有可同步实体的公共字段。
 *
 * 软删除：`deletedAt` 非空即墓碑。墓碑作为普通记录参与同步合并；
 * 被更高 revision 的编辑击败时记录"复活"，属预期行为（见 docs/architecture.md）。
 */
export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** 每次本地写入 +1；同步合并的第一决胜键（不依赖时钟） */
  revision: number;
  deletedAt: number | null;
}

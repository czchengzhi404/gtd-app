/**
 * 兼容转发层：选择器已拆分到 ./selectors/ 目录。
 *
 * 既有 import（`../store/selectors` / `@gtd/core`）全部照旧可用；
 * 新代码可直接从 ./selectors/index 或按域文件导入。
 */
export * from "./selectors/index";

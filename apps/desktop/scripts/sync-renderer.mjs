// 将 apps/mobile 的 expo export 产物同步到 apps/desktop/renderer/。
// 用法：bun run sync-renderer（在 apps/desktop 下）。产物由 expo export 生成，
// 本脚本只做复制，不生成代码。
import { cpSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const src = path.resolve(desktopRoot, "..", "mobile", "dist");
const dest = path.resolve(desktopRoot, "renderer");

if (!existsSync(path.join(src, "index.html"))) {
  console.error(
    "未找到 apps/mobile/dist/index.html——请先在 apps/mobile 下执行: bun run export:web",
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("[sync-renderer] 已复制", src, "->", dest);

import { app } from "electron";
import { sendToRenderer } from "./window";

/**
 * 自动更新：发布源由 electron-builder.yml 的 publish（GitHub Releases）生成
 * 到 app-update.yml，打包后自动生效。私有仓库需令牌，检查失败静默降级。
 */
export async function setupAutoUpdater(): Promise<void> {
  if (app.isPackaged !== true) return;
  try {
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.on("update-downloaded", () => {
      sendToRenderer("menu:action", { action: "update-ready" });
    });
    await autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.warn("[updater] 检查失败:", err instanceof Error ? err.message : String(err));
    });
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 4 * 60 * 60 * 1000);
  } catch (err) {
    console.warn("[updater] 初始化失败:", err instanceof Error ? err.message : String(err));
  }
}

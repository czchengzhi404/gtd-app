import { t } from "@gtd/ui";
import { collectLocalRecords, getSqliteExecutor } from "@gtd/core";

/**
 * 移动端数据出口：JSON 快照写入缓存目录，交给系统分享面板
 * （微信/网盘/邮件都能接收）。桌面端走 dialog + fs，见 desktop-actions。
 *
 * 为什么必须给移动端一个出口：备份/导出此前是桌面端专属，手机是很多用户的
 * 唯一设备——没有任何导出通道时，卸载即失联。
 */
export async function exportOnMobile(): Promise<boolean> {
  const records = await collectLocalRecords(getSqliteExecutor());
  const json = JSON.stringify({ app: "gtd", version: 1, exportedAt: Date.now(), records }, null, 2);

  const fs = await import("expo-file-system/legacy");
  const target = `${fs.cacheDirectory ?? ""}gtd-export-${Date.now()}.json`;
  await fs.writeAsStringAsync(target, json, { encoding: fs.EncodingType.UTF8 });

  const Sharing = await import("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) {
    await fs.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    throw new Error(t("more.status.exportFailed"));
  }
  await Sharing.shareAsync(target, {
    mimeType: "application/json",
    dialogTitle: t("more.export"),
  });
  await fs.deleteAsync(target, { idempotent: true }).catch(() => undefined);
  return true;
}

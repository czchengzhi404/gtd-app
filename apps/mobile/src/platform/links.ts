import { Linking } from "react-native";

/**
 * 外部链接统一出口。
 *
 * 为什么单独一个文件：以前只有「检查更新」那一处需要开外链，就直接写在
 * update-check.ts 里；现在关于页还要放 GitHub 仓库 / 问题反馈，
 * 再各写一份 Linking.openURL 就会散开。
 */

export const REPO = "czchengzhi404/gtd-app";
export const GITHUB_URL = `https://github.com/${REPO}`;
export const ISSUES_URL = `https://github.com/${REPO}/issues`;
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/** 打开外链；失败返回 false（调用方据此提示，不静默吞掉） */
export async function openExternalUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

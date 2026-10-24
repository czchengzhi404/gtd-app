import { isElectronRenderer } from "@gtd/core";

export function isDesktop(): boolean {
  return isElectronRenderer();
}

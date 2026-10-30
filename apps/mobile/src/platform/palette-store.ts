import { createStore } from "zustand/vanilla";

/**
 * 命令面板可见性（UI 全局状态，不落库）。
 * 桌面菜单 Cmd/Ctrl+K、渲染层键盘监听、移动端标题栏图标共用这一份状态，
 * 避免各屏幕各自维护开关造成"两处都能开、关不掉"的问题。
 */
interface PaletteState {
  visible: boolean;
}

export const paletteStore = createStore<PaletteState>(() => ({ visible: false }));

export function openPalette(): void {
  paletteStore.setState({ visible: true });
}

export function closePalette(): void {
  paletteStore.setState({ visible: false });
}

export function togglePalette(): void {
  paletteStore.setState((state) => ({ visible: !state.visible }));
}

/**
 * 唯一导航配置：移动端底部 Tab 与桌面端左侧栏都由它派生。
 * 禁止在 app 或任何壳里写第二套导航定义。labelKey 为 i18n 词典键。
 */

export interface NavItem {
  /** 与 Expo Router 路由段一致 */
  route: string;
  /** i18n 键（nav.*） */
  labelKey: string;
  /** @expo/vector-icons 图标名（Phase 2 接入具体字族） */
  icon: string;
}

/** 底部 Tab ≤5 项（ui-ux-pro-max Navigation 规则）。icon 为 Ionicons 名称 */
export const NAV_ITEMS: NavItem[] = [
  { route: "index", labelKey: "nav.inbox", icon: "file-tray-full" },
  { route: "today", labelKey: "nav.today", icon: "today" },
  { route: "focus", labelKey: "nav.focus", icon: "radio-button-on" },
  { route: "projects", labelKey: "nav.projects", icon: "folder-open" },
  { route: "more", labelKey: "nav.more", icon: "ellipsis-horizontal" },
];

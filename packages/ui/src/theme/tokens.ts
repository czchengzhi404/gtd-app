/**
 * 设计系统 token（v2「纸与墨」Calm Productivity）。
 * 纪律：组件只消费 token，不写字面量尺寸/颜色/字号。
 * 尺寸单位为逻辑像素；REM/百分比禁止用于行高与字号（避免随系统缩放漂移）。
 *
 * 向后兼容承诺：space / radius / type / hit / elevation / motion /
 * lightColors / darkColors / ThemeColors / compatColors 的导出名与语义保持不变；
 * v2 只在原基础上「加键」，不改既有键的含义。
 */

/** 4/8 栅格：xxs 2 / xs 4 / sm 8 / md 12 / lg 16 / xl 20 / xxl 24 / xxxl 32 / huge 40 */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

/** 圆角：xs 6 / sm 10 / md 14 / lg 20 / xl 24 / pill 999 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

/**
 * 字号阶梯。每个 variant 固定 size/lineHeight/weight——
 * 与 AppText 绑定，任何文本都不会超出其容器计算高度。
 *
 * v2：层级拉开（hero 28 → caption 11），正文行高加大到 24（可读性优先）。
 * 既有键（display/title/body/bodyStrong/label/caption/mono）保留，语义不变。
 */
export const type = {
  hero: { fontSize: 28, lineHeight: 36, fontWeight: "700" },
  display: { fontSize: 24, lineHeight: 32, fontWeight: "700" },
  title: { fontSize: 20, lineHeight: 28, fontWeight: "600" },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  // 正文 16px：任务标题是最高频阅读面，满足 ui-ux-pro-max 正文 ≥16 的可读性线
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  mono: { fontSize: 14, lineHeight: 21, fontWeight: "400" },
} as const;

export type TypeVariant = keyof typeof type;

/** 固定行高（列表/工具栏）：与字号无关，杜绝文字撑高布局 */
export const hit = {
  /** 最小触控目标（iOS 44 / Material 48 的折中上限） */
  min: 44,
  /** 列表行 */
  row: 56,
  /** 导航栏条目 */
  nav: 48,
  /** 主按钮 */
  button: 46,
  /** 小按钮 */
  buttonSm: 36,
  /** 底部 Tab 栏 */
  tabBar: 62,
  /** 顶部工具栏 */
  toolbar: 52,
} as const;

/**
 * 浮层阴影。v2 纪律：阴影只用于浮层（弹层/菜单/抽屉/Toast），
 * 列表与卡片一律靠 1px 边框和留白分层。
 */
export const elevation = {
  none: {},
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  float: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

/** 动效时长（ms）：fast 120 / base 200 / slow 320；尊重系统「减弱动态效果」由调用方判断 */
export const motion = { fast: 120, base: 200, slow: 320 } as const;

/** 动效缓动曲线（CSS cubic-bezier；RN 端可通过 Easing 近似或缺省） */
export const motionEasing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1)",
} as const;

/** 响应式断点（与 useBreakpoint 的 375/768/1024/1440 族对齐，语义命名供 AppShell 使用） */
export const breakpoint = {
  compact: 0,
  medium: 768,
  wide: 1024,
  ultra: 1440,
} as const;

/** 层级：只在浮层体系内使用，禁止组件自造 9999 */
export const zIndex = {
  base: 0,
  sticky: 10,
  overlay: 100,
  modal: 200,
  toast: 300,
} as const;

/* ---------------- 颜色（语义 token，亮/暗双套，对比度 ≥4.5:1） ---------------- */

export const lightColors = {
  /** 页面底色（暖中性「纸」，让白色卡片浮起来） */
  canvas: "#F7F5F1",
  /** 卡片/浮层底色（微暖白，比纯白更像纸） */
  surface: "#FFFDF9",
  /** 次级表面（输入框、分段控件底） */
  surfaceMuted: "#F0EDE7",
  /** 浮层专用表面（弹层/菜单/抽屉；亮色下与卡片一致） */
  surfaceOverlay: "#FFFDF9",
  text: "#1A1A18",
  textSecondary: "#5A5750",
  textTertiary: "#6E6A62",
  /** 主色：赭石（笔迹）。宝蓝降级为 info/链接色——蓝在暖白纸底上读作「屏幕色」，压不住纸感 */
  primary: "#8C3D0B",
  primaryMuted: "#F6E9DC",
  onPrimary: "#FFFFFF",
  /** 实心强调色上的文字（primary/danger/info 实心底） */
  textOnAccent: "#FFFFFF",
  border: "#D8D4CB",
  borderStrong: "#C9C4BA",
  danger: "#B42318",
  dangerMuted: "#FDECEA",
  success: "#0F7B4F",
  successMuted: "#E7F2EC",
  warning: "#96550A",
  warningMuted: "#FBF0DB",
  /** 信息/链接色：原主色宝蓝降级于此 */
  info: "#1D4ED8",
  infoMuted: "#E7ECFB",
  /** 中性语义底（Badge/Tag 的 default 态） */
  neutralMuted: "#EDEAE3",
  /** 键盘焦点环（web :focus；≥3:1 非文本对比） */
  focusRing: "#8C3D0B",
  /** 模态遮罩（Sheet/Toast 宿主） */
  scrim: "rgba(20,19,16,0.45)",
  overlay: "rgba(26,26,24,0.38)",
} as const;

export const darkColors = {
  canvas: "#0E1013",
  surface: "#17191E",
  surfaceMuted: "#202329",
  surfaceOverlay: "#1E2128",
  text: "#F2F0EB",
  textSecondary: "#B3AFA6",
  textTertiary: "#8A857C",
  primary: "#E0A878",
  primaryMuted: "#3A2818",
  onPrimary: "#2A1A0C",
  textOnAccent: "#2A1A0C",
  border: "#33363D",
  borderStrong: "#3E4148",
  danger: "#F97066",
  dangerMuted: "#3A1D1D",
  success: "#4ADE80",
  successMuted: "#123024",
  warning: "#F5B544",
  warningMuted: "#33270F",
  info: "#7CC7F5",
  infoMuted: "#13283A",
  neutralMuted: "#262A31",
  focusRing: "#E0A878",
  scrim: "rgba(0,0,0,0.6)",
  overlay: "rgba(0,0,0,0.55)",
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

/** 兼容旧引用（部分组件/外部仍按 bg 命名取色） */
export function compatColors(c: ThemeColors) {
  return { ...c, bg: c.canvas };
}

/* ---------------- 颜色工具（纯函数，可单测） ---------------- */

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/**
 * 给十六进制颜色加透明度，返回 `rgba(r, g, b, a)`。
 * 支持 #rgb / #rrggbb / #rrggbbaa（末两位为颜色自身 alpha，与外传 a 相乘）；
 * 非 hex 输入原样返回（不抛错，避免运行时白屏）。
 */
export function alpha(hex: string, a: number): string {
  const clean = hex.trim().replace(/^#/, "");
  const isHex = /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean);
  if (!isHex) return hex;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const embeddedAlpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  const alphaValue = Math.round(clamp01(a * embeddedAlpha) * 1000) / 1000;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alphaValue)})`;
}

/**
 * 类型安全的透明度辅助：键必须是 ThemeColors 的语义位，避免拼错色名。
 * `withOpacity(colors, "primary", 0.12)` → `rgba(29, 78, 216, 0.12)`
 */
export function withOpacity<K extends keyof ThemeColors>(
  colors: ThemeColors,
  key: K,
  a: number,
): string {
  return alpha(colors[key], a);
}

import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface MediaQueryListLike {
  matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
}

function getWebMediaQuery(): MediaQueryListLike | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(REDUCE_MOTION_QUERY) as unknown as MediaQueryListLike;
  } catch {
    return null;
  }
}

/**
 * 系统「减弱动态效果」偏好。
 *
 * - web：matchMedia("(prefers-reduced-motion: reduce)")，监听变化；
 * - native：AccessibilityInfo.isReduceMotionEnabled() + reduceMotionChanged 事件。
 *
 * 用法：所有非必要动效（Skeleton 微光、Toast 入场等）在返回 true 时降级为静态。
 * 默认 false（不误伤），读取失败也保持 false。
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => getWebMediaQuery()?.matches ?? false);

  useEffect(() => {
    let mounted = true;

    const media = getWebMediaQuery();
    if (media !== null) {
      const onChange = (event: { matches: boolean }) => {
        if (mounted) setReduced(event.matches);
      };
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onChange);
      } else if (typeof media.addListener === "function") {
        media.addListener(onChange);
      }
      setReduced(media.matches);
      return () => {
        mounted = false;
        if (typeof media.removeEventListener === "function") {
          media.removeEventListener("change", onChange);
        } else if (typeof media.removeListener === "function") {
          media.removeListener(onChange);
        }
      };
    }

    // native（或 web 无 matchMedia 的降级路径）
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        /* 平台未实现：保持 false */
      });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      if (mounted) setReduced(value);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

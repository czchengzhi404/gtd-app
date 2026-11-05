import { useEffect, useState } from "react";

/**
 * 一个"按分钟稳定"的当前时间戳。
 *
 * 为什么要它：页面里常见的写法是 `useAppStore((s) => getTodayTasks(s, Date.now()))`。
 * `Date.now()` 每次渲染都不同，而 `getTodayTasks` 返回**新数组**——
 * zustand 用 Object.is 比较快照，于是任何 store 变化都会让该页面重渲染，
 * 且列表永远无法被 `React.memo` 命中。对 2000+ 条的库，每次渲染都要重跑
 * filter + sort。
 *
 * 用本 hook 后：同一分钟内时间戳恒定（快照可比），跨分钟自动 +1 次重渲染，
 * 正好对应"到期状态"的最粗粒度变化。
 *
 * 注意：这是**渲染层**的取舍。需要秒级精确的地方（番茄钟、倒计时）不要用它。
 */
export function useNowMinute(): number {
  const [now, setNow] = useState(() => minuteStart(Date.now()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const remaining = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(minuteStart(Date.now()));
        schedule();
      }, remaining + 20);
    };
    schedule();

    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  return now;
}

function minuteStart(ms: number): number {
  return ms - (ms % 60_000);
}

import { describe, expect, test } from "bun:test";

import { createAutoSync } from "../sync/auto";
import type { AutoSyncTimers } from "../sync/auto";

/** 可手动推进的假定时器 + 假时钟 */
function makeClock() {
  let time = 1_000_000;
  let seq = 0;
  const tasks: { id: number; at: number; fn: () => void }[] = [];

  const timers: AutoSyncTimers = {
    setTimeout: (fn, ms) => {
      const id = (seq += 1);
      tasks.push({ id, at: time + ms, fn });
      return id;
    },
    clearTimeout: (handle) => {
      const index = tasks.findIndex((task) => task.id === handle);
      if (index >= 0) tasks.splice(index, 1);
    },
  };

  const settle = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };

  return {
    timers,
    now: () => time,
    /** 推进时钟并执行到期的定时器回调 */
    advance: async (ms: number) => {
      const target = time + ms;
      for (;;) {
        const due = tasks.filter((task) => task.at <= target).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        tasks.splice(tasks.indexOf(due), 1);
        time = due.at;
        due.fn();
        await settle();
      }
      time = target;
      await settle();
    },
    settle,
  };
}

describe("createAutoSync", () => {
  test("合并窗口内的多次改动只同步一次", async () => {
    const clock = makeClock();
    let runs = 0;
    const controller = createAutoSync({
      run: async () => {
        runs += 1;
      },
      now: clock.now,
      timers: clock.timers,
    });

    controller.markDirty();
    controller.markDirty();
    controller.markDirty();
    expect(runs).toBe(0);

    await clock.advance(30_000);
    expect(runs).toBe(1);
    expect(controller.getStatus().pending).toBe(false);
  });

  test("没有改动时不会自己跑", async () => {
    const clock = makeClock();
    let runs = 0;
    const controller = createAutoSync({ run: async () => void (runs += 1), now: clock.now, timers: clock.timers });
    await clock.advance(120_000);
    expect(runs).toBe(0);
    expect(await controller.tick()).toBe(false);
  });

  test("正在同步时不会并发", async () => {
    const clock = makeClock();
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = createAutoSync({
      run: async () => {
        runs += 1;
        await gate;
      },
      now: clock.now,
      timers: clock.timers,
    });

    controller.markDirty();
    await clock.advance(30_000);
    expect(runs).toBe(1);
    expect(controller.getStatus().running).toBe(true);

    // 执行中再 tick 直接返回 false，不会叠加第二次
    expect(await controller.tick()).toBe(false);
    expect(runs).toBe(1);

    release();
    await clock.settle();
    expect(controller.getStatus().running).toBe(false);
  });

  test("失败后按退避时间内不重试，退避结束后再试", async () => {
    const clock = makeClock();
    let runs = 0;
    const controller = createAutoSync({
      run: async () => {
        runs += 1;
        if (runs === 1) throw new Error("network down");
      },
      now: clock.now,
      timers: clock.timers,
      debounceMs: 1_000,
      backoffMs: 60_000,
    });

    controller.markDirty();
    await clock.advance(1_000);
    expect(runs).toBe(1);
    const status = controller.getStatus();
    expect(status.failures).toBe(1);
    expect(status.lastError).toBe("network down");
    expect(status.pending).toBe(true);

    // 退避期内：即使有 pending 也不跑
    await clock.advance(30_000);
    expect(runs).toBe(1);

    // 退避结束后自动再试
    await clock.advance(40_000);
    expect(runs).toBe(2);
    expect(controller.getStatus().failures).toBe(0);
  });

  test("两次自动同步之间遵守最小间隔", async () => {
    const clock = makeClock();
    let runs = 0;
    const controller = createAutoSync({
      run: async () => void (runs += 1),
      now: clock.now,
      timers: clock.timers,
      debounceMs: 1_000,
      minIntervalMs: 60_000,
    });

    controller.markDirty();
    await clock.advance(1_000);
    expect(runs).toBe(1);

    controller.markDirty();
    await clock.advance(1_000);
    expect(runs).toBe(1); // 距上次不足 60 秒

    await clock.advance(60_000);
    expect(runs).toBe(2);
  });

  test("runNow 忽略防抖直接执行", async () => {
    const clock = makeClock();
    let runs = 0;
    const controller = createAutoSync({ run: async () => void (runs += 1), now: clock.now, timers: clock.timers });
    controller.markDirty();
    expect(await controller.runNow()).toBe(true);
    expect(runs).toBe(1);
  });

  test("dispose 后不再触发", async () => {
    const clock = makeClock();
    let runs = 0;
    const controller = createAutoSync({ run: async () => void (runs += 1), now: clock.now, timers: clock.timers });
    controller.markDirty();
    controller.dispose();
    await clock.advance(120_000);
    expect(runs).toBe(0);
    expect(await controller.tick()).toBe(false);
  });
});

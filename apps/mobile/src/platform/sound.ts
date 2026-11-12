/**
 * 音效播放（默认关闭，用户主动开启才响）。
 *
 * 为什么默认关：任务类应用 90% 的使用场景在安静环境（办公室、床上、开会）。
 * 音效加错地方，用户第一件事就是去系统设置里关掉整个通知权限。
 * 只在「结果性事件」上响，且一次只响一条。
 *
 * 音色都是本地合成的（见 bench/make-sfx.py），两条合计约 9KB：
 *   complete  勾选完成，木质感「嗒」110ms
 *   undo      撤销，下行 blip 90ms
 *
 * 为什么没有「计时结束」音：这个 App 的「专注」页是筛选过的任务列表，
 * **没有倒计时器**。加一条永远不会触发的音效只是自我安慰，所以不做。
 *
 * 播放策略：每个音效懒创建一个 player，重复播放先 seekTo(0)。
 * 任何异常都吞掉——音效失败绝不能影响主流程。
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import { appStore } from "@gtd/core";

export type SfxName = "complete" | "undo";

/** kv 键：总开关（"1" 开启） */
export const KV_SOUND_ENABLED = "sound.enabled";

const SOURCES: Record<SfxName, number> = {
  complete: require("../../assets/sfx/complete.wav"),
  undo: require("../../assets/sfx/undo.wav"),
};

/** 各音效的相对音量：勾选最轻，撤销稍低 */
const VOLUME: Record<SfxName, number> = {
  complete: 0.55,
  undo: 0.4,
};

const players = new Map<SfxName, AudioPlayer>();
let modeReady = false;

export function isSoundEnabled(): boolean {
  return appStore.getState().kv[KV_SOUND_ENABLED] === "1";
}

async function ensureMode(): Promise<void> {
  if (modeReady) return;
  modeReady = true;
  try {
    // 不要在静音档位强行出声：跟随系统，静音就该是静音
    await setAudioModeAsync({ playsInSilentMode: false });
  } catch {
    /* 设置失败不影响播放尝试 */
  }
}

function playerFor(name: SfxName): AudioPlayer | null {
  const existing = players.get(name);
  if (existing !== undefined) return existing;
  try {
    const player = createAudioPlayer(SOURCES[name]);
    player.volume = VOLUME[name];
    players.set(name, player);
    return player;
  } catch {
    return null;
  }
}

/** 播放一条音效；未开启或任何失败都静默返回 */
export async function playSfx(name: SfxName): Promise<void> {
  if (!isSoundEnabled()) return;
  await play(name);
}

/**
 * 试听：**不看开关**，直接播。
 * 设置页刚点「开」时 kv 还没落盘（runCommand 是异步的），
 * 用 playSfx 会被 isSoundEnabled() 挡掉，用户以为开关坏了。
 */
export async function previewSfx(name: SfxName): Promise<void> {
  await play(name);
}

async function play(name: SfxName): Promise<void> {
  await ensureMode();
  const player = playerFor(name);
  if (player === null) return;
  try {
    // 上一条还没播完时要重头再来，否则连点勾选会「哑火」
    await player.seekTo(0);
    player.play();
  } catch {
    /* 静默 */
  }
}

/** 测试/退出时释放播放器 */
export function releaseSfx(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      /* 静默 */
    }
  }
  players.clear();
  modeReady = false;
}

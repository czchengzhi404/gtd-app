"""合成 App 需要的音效（纯 stdlib，不引入任何外部素材）。

为什么自己合成：
- 不涉及版权，也不用去找「免费音效库」再担心授权
- 每条都能压到 20KB 以内，APK 体积几乎不受影响
- 音色可控：任务类应用要的是「轻、短、不刺耳」，市面素材大多太亮

两条：
  complete.wav  勾选完成：木质感「嗒」，约 110ms
  undo.wav      撤销：温和的下行 blip，约 90ms

（原本还做了 timer.wav 供「专注计时结束」用，但后来发现专注页是筛选过的任务列表、
 并没有倒计时器，没有触发点，就不带这条了——不留永远不会响的音效。）

规格：22050Hz / 16bit / 单声道

用法：python bench/make-sfx.py
输出：apps/mobile/assets/sfx/*.wav
"""

import array
import math
import os
import struct
import wave

SR = 22050
OUT_DIR = "apps/mobile/assets/sfx"
os.makedirs(OUT_DIR, exist_ok=True)


def write_wav(name, samples):
    """samples 是 [-1,1] 的 float 列表，写 16bit 单声道。"""
    peak = max(1e-9, max(abs(s) for s in samples))
    # 统一归一化到 -3dB，避免某条特别响
    gain = 0.707 / peak
    data = array.array("h")
    for s in samples:
        v = int(max(-1.0, min(1.0, s * gain)) * 32767)
        data.append(v)
    path = os.path.join(OUT_DIR, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    kb = os.path.getsize(path) / 1024
    print(f"  {name}  {len(samples) / SR * 1000:.0f}ms  {kb:.1f}KB")


def env_decay(n, tau):
    """指数衰减包络。"""
    return [math.exp(-i / (tau * SR)) for i in range(n)]


def render_complete():
    """木质感「嗒」：极短的噪声瞬态 + 两个快速衰减的正弦分音。"""
    dur = 0.11
    n = int(SR * dur)
    env = env_decay(n, 0.028)
    out = []
    for i in range(n):
        t = i / SR
        # 主分音 1.15kHz + 高次 2.6kHz（木质泛音的关键）
        body = 0.9 * math.sin(2 * math.pi * 1150 * t) + 0.35 * math.sin(2 * math.pi * 2600 * t)
        # 起音瞬态：前 4ms 的噪声，给出「敲击」的边缘感
        noise = 0.0
        if i < int(SR * 0.004):
            noise = (math.sin(i * 12.9898) * 43758.5453 % 1.0 - 0.5) * 0.9
        out.append((body + noise) * env[i])
    return out


def render_undo():
    """撤销：下行 blip，软一点，别抢戏。"""
    dur = 0.09
    n = int(SR * dur)
    env = env_decay(n, 0.024)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 760 * (1 - 0.55 * (i / n))  # 760 → 342 Hz
        phase += 2 * math.pi * f / SR
        out.append(math.sin(phase) * env[i])
    return out


def render_timer():
    """三音上行 chime：C6-E6-G6，每个 180ms，间隔 60ms。"""
    notes = [1046.5, 1318.5, 1567.98]
    gap = 0.06
    note_dur = 0.18
    total = len(notes) * note_dur + (len(notes) - 1) * gap
    n = int(SR * total)
    out = [0.0] * n
    for idx, freq in enumerate(notes):
        start = int((idx * (note_dur + gap)) * SR)
        m = int(note_dur * SR)
        env = env_decay(m, 0.075)
        for i in range(m):
            if start + i >= n:
                break
            t = i / SR
            # 加一点二次谐波，让铃声圆润而不单薄
            v = math.sin(2 * math.pi * freq * t) + 0.22 * math.sin(2 * math.pi * freq * 2 * t)
            out[start + i] += v * env[i]
    return out


print("生成音效 →", OUT_DIR)
write_wav("complete.wav", render_complete())
write_wav("undo.wav", render_undo())
write_wav("timer.wav", render_timer())

"""把启动图标里的浅蓝对勾换成应用主色，供浅色启动屏使用。

背景：splash-icon.png 是一枚**浅蓝对勾 + 白色卡面**，本来就是给浅色背景画的；
但 app.json 里配的启动屏底色是 #208AEF（亮天蓝），等于浅蓝压亮蓝——对比度极低。
两处一起改：
  1. 底色调成应用画布色 #F7F5F1
  2. 对勾换成主色 #1D4ED8，在暖白底上才看得清

只重映射「偏蓝」的像素，保留原有的明暗过渡和柔和阴影（它们映射成主色的深浅）。

用法：python bench/recolor-splash-icon.py
输出：apps/mobile/assets/images/splash-icon.png（先备份原图）
"""

import os
import shutil
from PIL import Image

SRC = "apps/mobile/assets/images/splash-icon.png"
BACKUP = "apps/mobile/assets/images/splash-icon.original.png"

PRIMARY = (29, 78, 216)  # #1D4ED8，与 theme/tokens.ts 的 primary 一致

if not os.path.exists(BACKUP):
    shutil.copyfile(SRC, BACKUP)

img = Image.open(SRC).convert("RGBA")
w, h = img.size
px = img.load()

changed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        # 「偏蓝」判定：蓝色分量明显高于红，且不低于绿太多
        blueish = b > r + 18 and b > 90 and b >= g - 10
        if not blueish:
            continue
        # 用原像素的相对亮度决定主色的深浅：1.0 = 原色最亮处
        lum = max(r, g, b) / 255.0
        # 压一下高光，避免整块死白
        lum = min(1.0, 0.55 + lum * 0.55)
        nr = int(PRIMARY[0] * lum)
        ng = int(PRIMARY[1] * lum)
        nb = int(PRIMARY[2] * lum)
        px[x, y] = (min(255, nr), min(255, ng), min(255, nb), a)
        changed += 1

img.save(SRC, optimize=True)
print(f"重映射 {changed} 个像素 → {SRC}")
print(f"原图备份: {BACKUP}")

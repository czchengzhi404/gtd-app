"""把自适应图标三层合成一张预览图（模拟 Android 桌面上的实际效果）。

输出：assets-src/blender/preview-icon.png
- 左：圆角方形（大多数启动器的遮罩）
- 中：圆形（部分启动器 / Android 13 主题图标）
- 右：单色（主题图标着色效果）
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(ROOT, "apps", "mobile", "assets", "images")
OUT = os.path.join(ROOT, "assets-src", "blender", "preview-icon.png")

SIZE = 512


def load(name):
    return Image.open(os.path.join(IMG, name)).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)


bg = load("android-icon-background.png")
fg = load("android-icon-foreground.png")
mono = load("android-icon-monochrome.png")

# 合成前景到背景
full = bg.copy()
full.alpha_composite(fg)

# 圆角方形遮罩
mask_square = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask_square).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=int(SIZE * 0.22), fill=255)

# 圆形遮罩
mask_circle = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask_circle).ellipse((0, 0, SIZE - 1, SIZE - 1), fill=255)


def apply_mask(img, mask):
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


square = apply_mask(full, mask_square)
circle = apply_mask(full, mask_circle)

# 单色图标：白形 + 主题色底
theme = Image.new("RGBA", (SIZE, SIZE), (32, 138, 239, 255))
theme.alpha_composite(mono)
mono_round = apply_mask(theme, mask_square)

canvas = Image.new("RGBA", (SIZE * 3 + 96, SIZE + 64), (245, 247, 250, 255))
for i, tile in enumerate([square, circle, mono_round]):
    canvas.alpha_composite(tile, (32 + i * (SIZE + 16), 32))

canvas.convert("RGB").save(OUT, "PNG")
print("WROTE", OUT, os.path.getsize(OUT))

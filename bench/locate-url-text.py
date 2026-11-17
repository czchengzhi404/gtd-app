"""Locate the URL EditText's actual pixels: scan for dark text runs below the Server URL label."""
from PIL import Image
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "android-report/peer-devices/02-url-typed.png"
im = Image.open(path).convert("RGB")
px = im.load()
W, H = im.size
print(f"image: {path} {W}x{H}")

# 统计每一行的深色像素数（文字=深色）
rows = []
for y in range(1250, 1650):
    dark = sum(1 for x in range(90, 990) if sum(px[x, y]) / 3 < 130)
    if dark > 0:
        rows.append((y, dark))

if not rows:
    print("no dark pixels in y=1250..1650")
else:
    # 打印有字的行段
    groups = []
    for y, d in rows:
        if groups and y - groups[-1][-1][0] <= 2:
            groups[-1].append((y, d))
        else:
            groups.append([(y, d)])
    for g in groups:
        ys = [a for a, _ in g]
        total = sum(b for _, b in g)
        print(f"  text rows y={ys[0]}..{ys[-1]}  total_dark={total}  peak={max(b for _, b in g)}")
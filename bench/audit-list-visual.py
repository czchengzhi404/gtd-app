"""Pixel-level audit of the full-list screen style. ASCII output only (console is GBK)."""
from collections import Counter
from PIL import Image
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "android-report/review2/full-list.png"
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()
print(f"image: {path}  {W}x{H}")


def row_colors(y):
    c = Counter(px[x, y] for x in range(W))
    color, n = c.most_common(1)[0]
    return color, n / W


def lum(c):
    return sum(c) / 3


print(f"bg @ (12,700)   = {px[12, 700]}")
print(f"@ (540,420)     = {px[540, 420]}")
print(f"@ (540,900)     = {px[540, 900]}")
print(f"@ (5,700)       = {px[5, 700]}")
print(f"@ (30,700)      = {px[30, 700]}")

print("\n=== 1) horizontal divider scan y=620..2000 ===")
hits = []
for y in range(620, min(2000, H - 120)):
    color, ratio = row_colors(y)
    if ratio < 0.90:
        continue
    above, _ = row_colors(y - 6)
    below, _ = row_colors(y + 6)
    if color == above or color == below:
        continue
    if lum(color) < lum(above) - 4 and lum(color) < lum(below) - 4:
        hits.append((y, color))
merged = []
for y, c in hits:
    if merged and y - merged[-1][0] <= 2:
        merged[-1] = (y, c)
    else:
        merged.append((y, c))
if merged:
    print(f"FOUND {len(merged)} divider candidates:")
    for y, c in merged[:12]:
        print(f"  y={y} color={c}")
else:
    print("NONE - no full-width divider lines detected")

print("\n=== 2) search box border check (y=430..600) ===")
for y in range(430, 600):
    color, ratio = row_colors(y)
    if ratio > 0.72 and lum(color) < 240:
        print(f"  y={y} dominant={color} ratio={ratio:.2f}")

print("\n=== 3) panel vertical borders ===")
for probe_y in (700, 900, 1100):
    left = [(x, px[x, probe_y]) for x in range(0, 60) if lum(px[x, probe_y]) < 235]
    right = [(x, px[x, probe_y]) for x in range(W - 60, W) if lum(px[x, probe_y]) < 235]
    print(f"  y={probe_y}: left_dark={left[:4]} right_dark={right[:4]}")

print("\n=== 4) row band colors ===")
for name, (x, y) in {
    "edge(5,700)": (5, 700), "inner(30,700)": (30, 700),
    "mid(540,760)": (540, 760), "between(540,1000)": (540, 1000),
}.items():
    print(f"  {name} = {px[x, y]}")
"""Locate the search field underline on any page by scanning more vertical range."""
from collections import Counter
from PIL import Image
import sys

path = sys.argv[1]
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()
print(f"image: {path}")


def row_dominant(y):
    c = Counter(px[x, y] for x in range(W))
    color, n = c.most_common(1)[0]
    return color, n / W


def lum(c):
    return sum(c) / 3


print("rows with a single dominant non-background color, y=380..760:")
for y in range(380, 760):
    color, ratio = row_dominant(y)
    if ratio > 0.70 and lum(color) < 245 and color != (247, 245, 241):
        print(f"  y={y} dominant={color} ratio={ratio:.2f} lum={lum(color):.1f}")
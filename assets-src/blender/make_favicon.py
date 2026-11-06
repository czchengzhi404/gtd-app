"""从主图标派生小尺寸素材（favicon）。"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(ROOT, "apps", "mobile", "assets", "images")

src = Image.open(os.path.join(IMG, "icon.png")).convert("RGB")
for name, size in [("favicon.png", 64)]:
    out = src.resize((size, size), Image.LANCZOS)
    path = os.path.join(IMG, name)
    out.save(path, "PNG", optimize=True)
    print("WROTE", path, os.path.getsize(path))

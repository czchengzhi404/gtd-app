"""Pixel QA for scripts/verify-dark-theme.mjs; no global fixed coordinates.

Usage: python bench/audit-dark-theme.py android-report/dark-v2735/evidence.json
Checks the rendered pixels, including system status icons and native headers.
The output only claims the screens actually captured, not all app accessibility.
"""
import json
import sys
from collections import Counter
from pathlib import Path
from PIL import Image

manifest = Path(sys.argv[1])
evidence = json.loads(manifest.read_text(encoding="utf-8"))
checks = []


def check(name, passed, detail):
    checks.append({"name": name, "passed": bool(passed), "detail": detail})
    print(f"{'PASS' if passed else 'FAIL'} {name}: {detail}")


for capture in evidence["captures"]:
    file = Path(capture["file"])
    with Image.open(file) as source:
        image = source.convert("RGB")
    width, height = image.size
    dark = capture["theme"] == "dark"
    canvas = (14, 16, 19) if dark else (247, 245, 241)
    surface = (23, 25, 30) if dark else (255, 253, 249)
    accent = (224, 168, 120) if dark else (140, 61, 11)
    label = file.stem
    status = list(image.crop((int(width * .025), 4, int(width * .975), int(height * .028))).getdata())
    bright = sum(min(pixel) >= 180 for pixel in status)
    black = sum(max(pixel) < 65 for pixel in status)
    check(f"{label}: status icons", (bright if dark else black) > 100,
          f"bright={bright}, dark={black}, expected={'light' if dark else 'dark'} icons")
    body = Counter(image.crop((0, int(height * .12), width, int(height * .85))).getdata())
    canvas_pixels = body[canvas]
    check(f"{label}: app background", canvas_pixels > width * height * .05,
          f"{canvas}: {canvas_pixels} pixels")
    if capture["kind"] == "detail":
        header = Counter(image.crop((0, int(height * .04), width, int(height * .085))).getdata())
        check(f"{label}: native header", header[surface] > width * height * .02,
              f"expected={surface}, dominant={header.most_common(1)}")
    if capture["kind"] == "undo":
        x1, y1, x2, y2 = capture["actionBounds"]
        region = Counter(image.crop((max(0, x1 - 80), max(0, y1 - 8), min(width, x2 + 8), min(height, y2 + 8))).getdata())
        check(f"{label}: undo surface and action", region[surface] > 100 and region[accent] > 10,
              f"surface={region[surface]}, accent={region[accent]}")

check("Capture coverage", len(evidence["captures"]) == 7,
      f"{len(evidence['captures'])}/7 planned screens")
check("UI assertions and cleanup", bool(evidence["results"]) and all(r["passed"] for r in evidence["results"]),
      f"{sum(r['passed'] for r in evidence['results'])}/{len(evidence['results'])}")
output = manifest.with_name("pixel-audit.json")
output.write_text(json.dumps({"version": evidence["version"], "checks": checks}, indent=2), encoding="utf-8")
print(f"Pixel checks: {sum(c['passed'] for c in checks)}/{len(checks)}. {output}")
sys.exit(0 if all(c["passed"] for c in checks) else 1)

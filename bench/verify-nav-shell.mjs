/**
 * 截取底栏 + 撤销条，然后用像素判断：
 *   1) 底栏角标是否已从红改成赭石（danger 红 ≈ (180,35,24)，赭石 ≈ (140,61,11)）
 *   2) 撤销条背景是否已从近黑改成纸色
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const PKG = "app.gtd.local";
const OUT = "android-report/nav-shell";
fs.mkdirSync(OUT, { recursive: true });

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat", "/sdcard/s.png"], { encoding: "buffer" }));
}
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);

/* ---------- 底栏角标 ---------- */
adb(["shell", `am force-stop ${PKG}`]);
await sleep(900);
adb(["shell", `am start -n ${PKG}/.MainActivity`]);
await sleep(8000);
shot("1-tabbar");
console.log("已截底栏");

/* ---------- 触发一次撤销条：完成一个任务 ---------- */
const done = nodes().find((n) => /^Done$/i.test((n.text || "").trim()) || /^Done$/i.test((n.desc || "").trim()));
if (done !== undefined) {
  adb(["shell", `input tap ${done.cx} ${done.cy}`]);
  await sleep(2500);
  shot("2-undo-bar");
  console.log("已触发完成并截撤销条");
} else {
  console.log("没找到 Done 按钮，跳过撤销条截图");
}

/* ---------- 像素判定 ---------- */
const py = `
from PIL import Image
from collections import Counter

def analyze(path, label):
    im = Image.open(path).convert('RGB')
    px = im.load(); W, H = im.size
    print(f"--- {label} ({W}x{H}) ---")
    # 收集全图的高饱和像素，看有哪些显著的强调色
    colors = Counter()
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            if mx - mn > 40 and mx > 80:   # 有彩色
                colors[(r, g, b)] += 1
    for c, n in colors.most_common(8):
        print(f"  {c}  x{n}")

analyze(r'${OUT}/1-tabbar.png', 'tabbar')
`;

const out = execFileSync("python", ["-c", py], { encoding: "utf8" });
console.log(out);
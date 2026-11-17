/** 完成任务触发撤销条，像素判定它是否已从近黑改成纸色。 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { adb, dumpUi, parseNodes, sleep } from "../scripts/ui-test-kit.mjs";

const OUT = "android-report/nav-shell";
fs.mkdirSync(OUT, { recursive: true });

function shot(name) {
  adb(["shell", "screencap -p /sdcard/s.png"]);
  fs.writeFileSync(`${OUT}/${name}.png`, adb(["exec-out", "cat", "/sdcard/s.png"], { encoding: "buffer" }));
}
const nodes = () => parseNodes(dumpUi()).filter((n) => (n.text || n.desc || "").trim().length > 0);

const mark = nodes().find((n) => /^Mark complete: /.test(n.desc || ""));
console.log("Mark complete 按钮:", mark === undefined ? "(未找到)" : `${mark.cx},${mark.cy}`);
if (mark !== undefined) {
  adb(["shell", `input tap ${mark.cx} ${mark.cy}`]);
  await sleep(2200);
  shot("2-undo-bar");
  const txt = nodes().map((n) => (n.text || "").trim()).filter(Boolean);
  console.log("完成后界面:", txt.slice(0, 12).join(" | "));
}

// 像素判定：撤销条应该在底栏上方约 y=1900..2100 区域，是一块宽条形
const py = `
from PIL import Image
from collections import Counter
im = Image.open(r'${OUT}/2-undo-bar.png').convert('RGB')
px = im.load(); W, H = im.size
print("扫描 y=1700..2150 的整行主色（找撤销条那块）")
for y in range(1700, 2150, 25):
    c = Counter(px[x, y] for x in range(60, W-60))
    col, n = c.most_common(1)[0]
    ratio = n / (W-120)
    if ratio > 0.5:
        print(f"  y={y} dominant={col} ratio={ratio:.2f}")
`;
console.log(execFileSync("python", ["-c", py], { encoding: "utf8" }));
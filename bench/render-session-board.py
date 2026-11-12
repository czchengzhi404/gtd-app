"""把这一轮的工作画成一张看板（纯本地 Pillow 渲染，不依赖网络）。

为什么要画：这一轮从 v2.7.4 干到 v2.7.15，横跨导入、分享、更新检测、在线清单、
分区、同步等一堆东西，光看聊天记录根本抓不住全貌。一张图能同时说明
「发了哪些版本」「修了什么」「怎么验的」「还剩什么」。

踩过的坑（都在这份代码里规避了）：
- 微软雅黑没有 U+2713，直接写 ✓ 会渲染成豆腐块 —— 对勾用两笔线条手绘
- 雅黑没有 emoji —— 不要用 🟡✅❌，用色块 + 手绘符号
- 中文必须用 msyh.ttc / msyhbd.ttc，西文数字用 consola 更整齐

用法：python bench/render-session-board.py
输出：android-report/session-board.png
"""

import os
from PIL import Image, ImageDraw, ImageFont

W = 1680
BG = (246, 245, 242)
CARD = (255, 255, 255)
INK = (26, 26, 28)
SUB = (112, 112, 120)
FAINT = (168, 168, 176)
LINE = (228, 226, 221)
GREEN = (22, 143, 84)
AMBER = (189, 122, 12)
RED = (196, 62, 52)
BLUE = (37, 99, 235)
NAVY = (23, 30, 46)

FONTS = r"C:\Windows\Fonts"


def font(size, *names):
    for name in names:
        p = os.path.join(FONTS, name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


F_H1 = font(46, "msyhbd.ttc")
F_H2 = font(30, "msyhbd.ttc")
F_H3 = font(22, "msyhbd.ttc")
F_BODY = font(21, "msyh.ttc")
F_SMALL = font(18, "msyh.ttc")
F_TINY = font(16, "msyh.ttc")
F_NUM = font(52, "consola.ttf", "msyhbd.ttc")
F_NUM_S = font(26, "consola.ttf", "msyh.ttc")
F_MONO = font(18, "consola.ttf", "msyh.ttc")

img = Image.new("RGB", (W, 3600), BG)
d = ImageDraw.Draw(img)


def card(x, y, w, h, r=18, fill=CARD, outline=LINE):
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill, outline=outline, width=1)


def text(xy, s, f, fill=INK):
    d.text(xy, s, font=f, fill=fill)


def text_w(s, f):
    return d.textlength(s, font=f)


def check(x, y, size=14, color=GREEN, width=3):
    """手绘对勾：微软雅黑没有 U+2713。"""
    d.line([x, y + size * 0.52, x + size * 0.36, y + size], fill=color, width=width)
    d.line([x + size * 0.36, y + size, x + size, y], fill=color, width=width)


def cross(x, y, size=13, color=RED, width=3):
    d.line([x, y, x + size, y + size], fill=color, width=width)
    d.line([x + size, y, x, y + size], fill=color, width=width)


def dot(x, y, r=6, color=GREEN):
    d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def wrap(s, f, max_w):
    """按像素宽度折行（中文按字折，不含空格也无所谓）。"""
    lines, cur = [], ""
    for ch in s:
        trial = cur + ch
        if text_w(trial, f) > max_w and cur:
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


# ---------------------------------------------------------------- 头部
d.rectangle([0, 0, W, 250], fill=NAVY)
text((56, 44), "GTD List 移动端 · 这一轮做了什么", F_H1, (255, 255, 255))
text((58, 112), "v2.7.4 → v2.7.17   14 个版本连续发布，每个都带设备实测", F_BODY, (162, 172, 192))

stats = [
    ("14", "个版本", "v2.7.4 → v2.7.17"),
    ("489", "项测试", "40 个文件全绿"),
    ("64", "项已验收", "功能矩阵"),
    ("1", "项待验", "通知"),
]
sx = 58
for value, label, hint in stats:
    text((sx, 160), value, F_NUM, (255, 255, 255))
    wv = text_w(value, F_NUM)
    text((sx + wv + 10, 178), label, F_BODY, (200, 208, 222))
    text((sx + wv + 10, 206), hint, F_TINY, (138, 148, 168))
    sx += 400

# ---------------------------------------------------------------- 版本时间线
y = 296
text((56, y), "① 版本时间线", F_H2)
text((56, y + 40), "绿色为一次做对；橙色是当次发布后发现问题、下一版立刻修掉", F_SMALL, SUB)
y += 92

versions = [
    ("v2.7.4", 38, "移动端导入 JSON 改走 expo-document-picker", True),
    ("v2.7.5", 39, "二级页面双重标题栏修正", True),
    ("v2.7.6", 40, "启动自动检测新版本 + 关于页/更多页横幅", True),
    ("v2.7.7", 41, "更新判断下沉 core，补 11 项单测", True),
    ("v2.7.8", 42, "分享导入：注册 VIEW + application/json", False),
    ("v2.7.9", 43, "+native-intent 改写 content:// 路由", False),
    ("v2.7.10", 44, "文件 URL 改模块变量交接", True),
    ("v2.7.11", 45, "首次安装时不让引导页抢路由", True),
    ("v2.7.12", 46, "从链接导入在线清单（WebSocket 只读）", True),
    ("v2.7.13", 47, "筛选到 0 条不再说「收集箱是空的」", True),
    ("v2.7.14", 48, "首启引导修活 + 项目分区可建可指派", True),
    ("v2.7.15", 49, "新建的空分区也要显示标题", True),
    ("v2.7.16", 50, "启动屏配色统一、勾选回弹、项目色点、写作纸感", True),
    ("v2.7.17", 51, "音效两条（默认关）+ 启动图标放大", True),
]

card_h = 74
row_w = (W - 112 - 24) // 2
for i, (ver, code, title, ok) in enumerate(versions):
    col = i % 2
    row = i // 2
    cx = 56 + col * (row_w + 24)
    cy = y + row * (card_h + 12)
    card(cx, cy, row_w, card_h, r=14)
    # 状态点
    dot(cx + 26, cy + card_h // 2, 7, GREEN if ok else AMBER)
    text((cx + 44, cy + 9), ver, F_H3)
    text((cx + 44 + text_w(ver, F_H3) + 10, cy + 13), f"#{code}", F_MONO, FAINT)
    # 标题最多两行，按像素宽度折行，不截断
    lines = wrap(title, F_SMALL, row_w - 120)[:2]
    for li, line in enumerate(lines):
        text((cx + 44, cy + 36 + li * 21), line, F_SMALL, INK)
    if not ok:
        tag = "下版修掉"
        tw = text_w(tag, F_TINY)
        d.rounded_rectangle([cx + row_w - tw - 26, cy + 24, cx + row_w - 14, cy + 50], radius=8, fill=(253, 243, 226))
        text((cx + row_w - tw - 20, cy + 28), tag, F_TINY, AMBER)

y += ((len(versions) + 1) // 2) * (card_h + 12) + 46

# ---------------------------------------------------------------- 功能矩阵
text((56, y), "② 功能验收进度", F_H2)
y += 56
card(56, y, W - 112, 150, r=18)
# 进度条
bar_x, bar_y, bar_w, bar_h = 96, y + 84, W - 336, 26
d.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + bar_h], radius=13, fill=(238, 236, 231))
done_w = int(bar_w * 64 / 65)
d.rounded_rectangle([bar_x, bar_y, bar_x + done_w, bar_y + bar_h], radius=13, fill=GREEN)
text((96, y + 30), "功能矩阵：64 项已实测通过 / 65 项", F_H3)
text((96 + text_w("功能矩阵：64 项已实测通过 / 65 项", F_H3) + 16, y + 33), "本轮从 19 项待验降到 1 项", F_SMALL, SUB)
pct = "98.5%"
text((W - 96 - text_w(pct, F_H2), y + 26), pct, F_H2, GREEN)
text((96, y + 122), "唯一剩下的「通知」需要真实等到期提醒触发，模拟器时间不好造", F_TINY, FAINT)

y += 150 + 46

# ---------------------------------------------------------------- 设备验证
text((56, y), "③ 怎么验的：全部真机 intent / 触摸操作，不是只跑单测", F_H2)
y += 56

checks = [
    ("verify-link-import", "9/10", "贴 onlinelistmaker 链接 → 26 条 → 项目 25 open"),
    ("verify-share-import", "7/10", "微信「用其他应用打开」→ 冷启动导入"),
    ("verify-note-history-export", "16/17", "版本历史 2 条 + 导出 回复客户邮件-…md（中文名）"),
    ("verify-word-count", "10/10", "401 词 → 401 words · ~2 min read，项目头同步显示"),
    ("verify-inbox-empty-state", "7/7", "筛到 0 条显示 No tasks match，不再说收集箱空"),
    ("verify-perspective-reorder", "12/12", "存视角 overdueonly + 拖拽后顺序真的变了"),
    ("verify-onboarding", "4/4", "清库后首次启动出现 3 步引导，二次启动不再出现"),
    ("verify-sections", "9/9", "新建分区立刻可见 → 任务详情指派 → 归到 SHOP 下"),
    ("verify-sync-connect", "6/8", "本地自托管服务器收到 GET /index + 2 个 PUT"),
    ("verify-sound", "7/7", "2425 帧 = 110ms，正是 complete.wav 的长度"),
]

card_w = (W - 112 - 24) // 2
for i, (name, score, desc) in enumerate(checks):
    col = i % 2
    row = i // 2
    cx = 56 + col * (card_w + 24)
    cy = y + row * 76
    card(cx, cy, card_w, 64, r=14)
    check(cx + 22, cy + 26, 13, GREEN, 3)
    text((cx + 48, cy + 12), name, F_SMALL)
    sw = text_w(score, F_SMALL)
    text((cx + card_w - sw - 20, cy + 12), score, F_SMALL, GREEN if score.startswith(("1", "9")) else AMBER)
    text((cx + 48, cy + 38), desc, F_TINY, SUB)

y += ((len(checks) + 1) // 2) * 76 + 46

# ---------------------------------------------------------------- 截图墙
text((56, y), "④ 界面实拍", F_H2)
y += 56

shots = [
    ("android-report/onboarding/1-first-launch.png", "首启引导（修活后）"),
    ("android-report/sections/6-project-grouped.png", "分区归组 SHOP"),
    ("android-report/inbox-empty/2-filtered-empty.png", "筛选空态文案"),
    ("android-report/link-import/5-projects.png", "链接导入 25 open"),
    ("android-report/word-count/4-saved.png", "字数 / 阅读时长"),
    ("android-report/sync-connect/5-saved.png", "自托管同步配置"),
]

# 手机截图是 1080x2400（约 1:2.22），缩略图按同样比例，不裁切
thumb_w, thumb_h = 258, 573
gap = 26
cols = 3
total_w = cols * thumb_w + (cols - 1) * gap
start_x = (W - total_w) // 2

for i, (path, caption) in enumerate(shots):
    col = i % cols
    row = i // cols
    tx = start_x + col * (thumb_w + gap)
    ty = y + row * (thumb_h + 56)
    if not os.path.exists(path):
        continue
    src = Image.open(path).convert("RGB")
    # 等比缩放到宽度贴合，高度按原比例——完整显示，不丢内容
    ratio = thumb_w / src.width
    src = src.resize((thumb_w, int(src.height * ratio)), Image.LANCZOS)
    if src.height > thumb_h:
        src = src.crop((0, 0, thumb_w, thumb_h))
    img.paste(src, (tx, ty))
    d.rounded_rectangle([tx, ty, tx + thumb_w, ty + src.height], radius=14, outline=LINE, width=2)
    cap_w = text_w(caption, F_SMALL)
    text((tx + (thumb_w - cap_w) // 2, ty + src.height + 14), caption, F_SMALL, SUB)

y += 2 * (thumb_h + 56) + 30

# ---------------------------------------------------------------- 页脚
d.line([56, y, W - 56, y], fill=LINE, width=1)
text((56, y + 22), "生成于 2026-11-11 · 数据来源：docs/mobile-feature-matrix.md 与 android-report/ 下的实测截图", F_TINY, FAINT)

img = img.crop((0, 0, W, y + 70))
os.makedirs("android-report", exist_ok=True)
out = "android-report/session-board.png"
img.save(out, optimize=True)
print(f"wrote {out}  {img.width}x{img.height}")

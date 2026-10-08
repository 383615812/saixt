# -*- coding: utf-8 -*-
"""生成「文华教育」品牌社交分享卡片（1200×630，og:image 标准尺寸）。

用途：门户页与各子系统 <meta property="og:image"> 缩略图（微信/QQ/搜索引擎分享卡片）。
依赖：Pillow + 系统中文字体（微软雅黑 msyh / 黑体 simhei）。
运行： <venv>/python.exe deploy/make-og-cover.py
产出： deploy/og-cover.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "og-cover.png")

BG_TOP = (11, 18, 32)
BG_BOTTOM = (18, 28, 48)
GOLD = (212, 175, 106)
GOLD_LIGHT = (242, 212, 146)
INK = (234, 238, 245)
DIM = (150, 163, 182)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]
reg = [p for p in FONT_CANDIDATES if os.path.exists(p)]
if not reg:
    raise SystemExit("未找到中文字体")


def font(size, bold=True):
    if bold:
        for p in [r"C:\Windows\Fonts\msyhbd.ttc"] + reg:
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.truetype(reg[0], size)


canvas = Image.new("RGB", (W, H), BG_TOP)
draw = ImageDraw.Draw(canvas)

# 1) 竖向渐变底
for y in range(H):
    t = y / (H - 1)
    draw.line(
        [(0, y), (W, y)],
        fill=(
            int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
            int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
            int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
        ),
    )

# 2) 细网格纹理（与门户页视觉语言一致）
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
for x in range(0, W, 48):
    gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
for y in range(0, H, 48):
    gd.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
canvas = Image.alpha_composite(canvas.convert("RGBA"), grid)

# 3) 中央光晕
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gl = ImageDraw.Draw(glow)
for r in range(300, 0, -6):
    a = int(16 * (1 - r / 300) ** 1.6)
    gl.ellipse([W // 2 - r, 250 - r, W // 2 + r, 250 + r], fill=(212, 175, 106, a))
canvas = Image.alpha_composite(canvas, glow)

draw = ImageDraw.Draw(canvas)

# 4) 标识：双线金环 + 开启的书页
cx, cy, R = W // 2, 214, 74
draw.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(80, 92, 120, 255), width=2)
draw.ellipse([cx - R + 6, cy - R + 6, cx + R - 6, cy + R - 6], outline=(212, 175, 106, 200), width=2)
# 书页（左右对称展开）
draw.polygon([(cx - 4, cy - 30), (cx - 44, cy - 16), (cx - 44, cy + 30), (cx - 4, cy + 16)], fill=(255, 255, 255, 235))
draw.polygon([(cx + 4, cy - 30), (cx + 44, cy - 16), (cx + 44, cy + 30), (cx + 4, cy + 16)], fill=(255, 255, 255, 160))
draw.line([(cx, cy - 30), (cx, cy + 16)], fill=(212, 175, 106, 255), width=4)
draw.line([(cx - 44, cy + 34), (cx + 44, cy + 34)], fill=(212, 175, 106, 210), width=3)
draw.line([(cx - 28, cy + 44), (cx + 28, cy + 44)], fill=(120, 132, 158, 255), width=2)

# 5) 品牌文字
f_brand = font(76)
f_en = font(20, bold=False)
f_slogan = font(32, bold=False)
f_sub = font(24, bold=False)


def centered(text, y, f, fill):
    box = draw.textbbox((0, 0), text, font=f)
    draw.text((W // 2 - (box[2] - box[0]) // 2 - box[0], y), text, font=f, fill=fill)


centered("文华教育", 322, f_brand, INK)
centered("W E N H U A   E D U C A T I O N", 412, f_en, (140, 152, 174))
centered("以文化人  ·  以 AI 启智", 462, f_slogan, GOLD_LIGHT)

# 6) 三条系统线（胶囊）
chips = ["K12 AI 素养教育", "云南春招升学平台", "职教高考 AI Agent"]
f_chip = font(21, bold=False)
pad_x, chip_h, gap = 26, 46, 18
widths = [draw.textbbox((0, 0), c, font=f_chip)[2] + pad_x * 2 for c in chips]
total = sum(widths) + gap * (len(chips) - 1)
x = (W - total) // 2
chip_y = 528
for c, cw in zip(chips, widths):
    draw.rounded_rectangle([x, chip_y, x + cw, chip_y + chip_h], radius=chip_h // 2,
                           outline=(96, 108, 134, 255), width=2)
    box = draw.textbbox((0, 0), c, font=f_chip)
    draw.text((x + pad_x - box[0], chip_y + (chip_h - (box[3] - box[1])) // 2 - box[1]),
              c, font=f_chip, fill=DIM)
    x += cw + gap

# 7) 底部收口线
draw.line([(90, 606), (W - 90, 606)], fill=(58, 68, 92, 255), width=1)

canvas.convert("RGB").save(OUT, "PNG", optimize=True)
print("生成:", OUT, os.path.getsize(OUT), "bytes")

# -*- coding: utf-8 -*-
"""生成「文华教育」品牌社交分享卡片（1200×630，og:image 标准尺寸）。

用途：门户页与三个子系统的 <meta property="og:image"> 缩略图（微信 / QQ / 搜索引擎分享卡片）。
      —— 微信、QQ、微博的卡片**只渲染栅格图（PNG/JPG），不渲染 SVG**，
         因此分享图必须是 PNG，不能沿用各站原有的 svg logo。

依赖：Pillow + 系统中文字体（微软雅黑 msyhbd/msyh，回退黑体 simhei）。
运行： <venv>/python.exe deploy/make-og-cover.py
产出： deploy/og-cover.png          门户页（品牌总览）
       deploy/og-xiaolongxia.png   小龙虾 AI 学习平台
       deploy/og-saixt.png         云南春招智能学习平台
       deploy/og-ynva.png          云智学 · 职教高考 AI Agent
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
HERE = os.path.dirname(os.path.abspath(__file__))

BG_TOP = (11, 18, 32)
BG_BOTTOM = (18, 28, 48)
GOLD = (212, 175, 106)
GOLD_LIGHT = (242, 212, 146)
INK = (234, 238, 245)
DIM = (150, 163, 182)
FAINT = (108, 120, 142)

ENTITY = "云南文华教育科技有限责任公司"
DOMAIN = "www.xlxzb.com"
ICP = "滇ICP备2026019339号-1"

FONT_REG = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]
FONT_BOLD = [r"C:\Windows\Fonts\msyhbd.ttc"] + FONT_REG
if not any(os.path.exists(p) for p in FONT_REG):
    raise SystemExit("未找到中文字体")


def font(size, bold=False):
    for p in (FONT_BOLD if bold else FONT_REG):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.truetype(FONT_REG[0], size)


SPECS = [
    dict(
        out="og-cover.png",
        eyebrow="WENHUA EDUCATION",
        title="文华教育",
        sub="以文化人 · 以 AI 启智 —— 三个学习系统，一套成长方法论",
        chips=["K12 AI 素养教育", "云南春招升学平台", "职教高考 AI Agent"],
    ),
    dict(
        out="og-xiaolongxia.png",
        eyebrow="文华教育 · K12 AI 素养教育",
        title="小龙虾 AI 学习平台",
        sub="智能学习规划 · AI 辅导答疑 · 学情分析 · 错题本 · 家校互通",
        chips=["AI 学习规划", "AI 辅导答疑", "错题本", "家校互通"],
    ),
    dict(
        out="og-saixt.png",
        eyebrow="文华教育 · 云南春季招生",
        title="云南春招智能学习平台",
        sub="刷题 · 全省排名 · 志愿推荐，一站式春招备考助手",
        chips=["2.8 万+ 真题", "全省排名", "志愿推荐", "会考全覆盖"],
    ),
    dict(
        out="og-ynva.png",
        eyebrow="文华教育 · 职业教育",
        title="云智学 · 职教高考 AI Agent",
        sub="知识点图谱 · 智能刷题 · 学情诊断 · 个性化学习计划",
        chips=["知识点图谱", "智能刷题", "学情诊断"],
    ),
]


def draw_logo(draw, cx, cy, R):
    """标识：双线金环 + 对称展开书页（与 logo-wenhua.svg 同构，栅格化重绘）。"""
    draw.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(80, 92, 120, 255), width=2)
    draw.ellipse([cx - R + 5, cy - R + 5, cx + R - 5, cy + R - 5], outline=(212, 175, 106, 200), width=2)
    u = R / 74.0  # 以 74 为基准等比缩放
    draw.polygon([(cx - 4 * u, cy - 30 * u), (cx - 44 * u, cy - 16 * u),
                  (cx - 44 * u, cy + 30 * u), (cx - 4 * u, cy + 16 * u)], fill=(255, 255, 255, 235))
    draw.polygon([(cx + 4 * u, cy - 30 * u), (cx + 44 * u, cy - 16 * u),
                  (cx + 44 * u, cy + 30 * u), (cx + 4 * u, cy + 16 * u)], fill=(255, 255, 255, 160))
    draw.line([(cx, cy - 30 * u), (cx, cy + 16 * u)], fill=(212, 175, 106, 255), width=max(2, int(4 * u)))
    draw.line([(cx - 44 * u, cy + 34 * u), (cx + 44 * u, cy + 34 * u)], fill=(212, 175, 106, 210), width=max(2, int(3 * u)))
    draw.line([(cx - 28 * u, cy + 44 * u), (cx + 28 * u, cy + 44 * u)], fill=(120, 132, 158, 255), width=2)


def build(spec):
    canvas = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(canvas)

    # 1) 竖向渐变底
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=(
            int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
            int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
            int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)))

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
    CY_GLOW = 176
    for r in range(280, 0, -6):
        a = int(16 * (1 - r / 280) ** 1.6)
        gl.ellipse([W // 2 - r, CY_GLOW - r, W // 2 + r, CY_GLOW + r], fill=(212, 175, 106, a))
    canvas = Image.alpha_composite(canvas, glow)
    d = ImageDraw.Draw(canvas)

    # 4) 标识
    draw_logo(d, W // 2, 152, 56)

    def centered(text, y, f, fill, shadow=False):
        box = d.textbbox((0, 0), text, font=f)
        x = W // 2 - (box[2] - box[0]) // 2 - box[0]
        if shadow:
            d.text((x, y + 1), text, font=f, fill=(0, 0, 0))
        d.text((x, y), text, font=f, fill=fill)

    # 5) 副标（眉题）
    f_eyebrow = font(21, bold=False)
    centered(spec["eyebrow"], 240, f_eyebrow, GOLD)

    # 6) 主标题：自动缩字号以适配 1000px 宽度
    size = 70
    while size > 34:
        f_title = font(size, bold=True)
        tw = d.textbbox((0, 0), spec["title"], font=f_title)[2]
        if tw <= W - 200:
            break
        size -= 2
    centered(spec["title"], 282, f_title, INK, shadow=True)

    # 7) 一句话描述
    f_sub = font(25, bold=False)
    tw = d.textbbox((0, 0), spec["sub"], font=f_sub)[2]
    if tw > W - 160:
        f_sub = font(22, bold=False)
    centered(spec["sub"], 408, f_sub, DIM)

    # 8) 能力胶囊
    f_chip = font(21, bold=False)
    pad_x, chip_h, gap = 26, 46, 18
    widths = [d.textbbox((0, 0), c, font=f_chip)[2] + pad_x * 2 for c in spec["chips"]]
    total = sum(widths) + gap * (len(widths) - 1)
    if total > W - 120:  # 过宽则整体缩距
        gap = 12
        pad_x = 20
        widths = [d.textbbox((0, 0), c, font=f_chip)[2] + pad_x * 2 for c in spec["chips"]]
        total = sum(widths) + gap * (len(widths) - 1)
    x = (W - total) // 2
    chip_y = 470
    for c, cw in zip(spec["chips"], widths):
        d.rounded_rectangle([x, chip_y, x + cw, chip_y + chip_h], radius=chip_h // 2,
                            outline=(96, 108, 134, 255), width=2)
        box = d.textbbox((0, 0), c, font=f_chip)
        d.text((x + pad_x - box[0], chip_y + (chip_h - (box[3] - box[1])) // 2 - box[1]),
               c, font=f_chip, fill=DIM)
        x += cw + gap

    # 9) 页脚：主体 + 域名 + 备案号（合规信息随图传播）
    f_foot = font(18, bold=False)
    centered(f"{ENTITY}   ·   {DOMAIN}   ·   {ICP}", 556, f_foot, FAINT)

    # 10) 底部收口线
    d.line([(90, 600), (W - 90, 600)], fill=(58, 68, 92, 255), width=1)

    out = os.path.join(HERE, spec["out"])
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print("生成:", spec["out"], os.path.getsize(out), "bytes")


if __name__ == "__main__":
    for s in SPECS:
        build(s)

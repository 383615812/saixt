# -*- coding: utf-8 -*-
"""生成《云南春招智能学习平台 · 部署后验证步骤》PDF 文档"""
import os
import platform
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                LongTable, KeepTogether, Flowable, PageBreak)

# ---------- 品牌配色 ----------
PRIMARY = HexColor('#4f5ff0')
PRIMARY_DARK = HexColor('#3b46c4')
ACCENT = HexColor('#7c3aed')
INK = HexColor('#1a1d29')
MUTED = HexColor('#5c6272')
RULE = HexColor('#e4e7f0')
BG_SOFT = HexColor('#f6f7fb')
GREEN = HexColor('#0b926b')
GREEN_SOFT = HexColor('#e6f6f0')
AMBER = HexColor('#b45309')
AMBER_SOFT = HexColor('#fdf3e3')

# ---------- CJK 字体 ----------
def register_cjk_font():
    system = platform.system()
    if system == 'Windows':
        paths = [
            'C:/Windows/Fonts/msyh.ttc',   # 微软雅黑
            'C:/Windows/Fonts/msyhbd.ttc',
            'C:/Windows/Fonts/simsun.ttc',
        ]
    elif system == 'Darwin':
        paths = ['/System/Library/Fonts/PingFang.ttc']
    else:
        paths = ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
    for p in paths:
        if os.path.exists(p):
            try:
                pdfmetrics.registerFont(TTFont('CJKFont', p, subfontIndex=0))
                return 'CJKFont'
            except Exception:
                continue
    return None

FONT = register_cjk_font()
if FONT is None:
    raise RuntimeError('未找到可用的中文字体')

# ---------- 样式 ----------
def S(name, **kw):
    base = dict(fontName=FONT, wordWrap='CJK')
    base.update(kw)
    return ParagraphStyle(name, **base)

styles = {
    'title': S('title', fontSize=22, leading=30, textColor=white, alignment=TA_CENTER, spaceAfter=6),
    'subtitle': S('subtitle', fontSize=12, leading=18, textColor=HexColor('#e6e8ff'), alignment=TA_CENTER, spaceAfter=4),
    'meta': S('meta', fontSize=9.5, leading=14, textColor=HexColor('#d9dcff'), alignment=TA_CENTER),
    'h1': S('h1', fontSize=15, leading=20, textColor=PRIMARY_DARK, spaceBefore=16, spaceAfter=8),
    'h2': S('h2', fontSize=12.5, leading=17, textColor=ACCENT, spaceBefore=12, spaceAfter=6),
    'body': S('body', fontSize=10.5, leading=17, textColor=INK, spaceAfter=8),
    'item': S('item', fontSize=10.5, leading=17, textColor=INK, spaceAfter=7, leftIndent=4),
    'note': S('note', fontSize=9.5, leading=15, textColor=HexColor('#7c4a03'), spaceAfter=10),
    'caption': S('caption', fontSize=9, leading=13, textColor=MUTED, alignment=TA_CENTER, spaceBefore=4, spaceAfter=8),
    'footer': S('footer', fontSize=8.5, leading=12, textColor=MUTED, alignment=TA_CENTER),
}

# ---------- 装饰 ----------
class ColoredDivider(Flowable):
    def __init__(self, width, height=2, color=PRIMARY, space_before=4, space_after=10):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.color = color
        self.spaceBefore = space_before
        self.spaceAfter = space_after

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)

class CoverBand(Flowable):
    """封面顶部品牌渐变带（用多段色块近似渐变）"""
    def __init__(self, width, height=6):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.spaceAfter = 0

    def draw(self):
        steps = 24
        seg = self.width / steps
        for i in range(steps):
            t = i / (steps - 1)
            r = int(0x4f + (0x8b - 0x4f) * t)
            g = int(0x5f + (0x5c - 0x5f) * t)
            b = int(0xf0 + (0xf6 - 0xf0) * t)
            self.canv.setFillColor(HexColor('#%02x%02x%02x' % (r, g, b)))
            self.canv.rect(i * seg, 0, seg + 0.5, self.height, fill=1, stroke=0)

def check_mark():
    return '<font color="#0b926b"><b>☑</b></font>'

def box_mark():
    return '<font color="#5c6272">□</font>'

# ---------- 数据 ----------
SECTIONS = [
    ('一、验证前准备', [
        '构建产物完整：确认 dist/ 目录包含 index.html、assets/、sw.js、manifest.webmanifest、icon-192.png、icon-512.png、logo.svg',
        'SPA 路由回退：服务器未知路径回退到 index.html（Nginx try_files $uri /index.html），否则刷新子页面会 404',
        'HTTPS 已启用：Service Worker 与 PWA 安装仅在 HTTPS 或 localhost 下可用，证书有效、无混合内容',
        '后端 API 连通：/api 代理指向后端服务（默认 localhost:3000），/qimages 图片资源可访问',
        '密钥安全：DeepSeek API Key 等敏感信息仅存于后端，前端构建产物中无明文密钥',
    ]),
    ('二、基础功能验证', [
        '首页正常加载：Hero 区、学习概览、倒计时、考试构成、功能入口正常渲染，无控制台报错',
        '注册 / 登录 / 登出：全流程可用，表单校验、错误提示、密码可见切换正常',
        '核心功能页可达：题库、错题本、任务中心、复习计划、AI 学习计划、AI 答疑、AI 专项练习、志愿推荐、院校库、院校详情、学习排行、成就、盲盒、知识图谱、数据大屏、学习周报、个人中心 —— 逐页访问无白屏、无 404',
        '全局导航可用：顶栏导航、移动端抽屉、更多面板、回到顶部均正常',
    ]),
    ('三、核心学习流程验证', [
        '刷题与判题：选项选中态、提交判题、正确/错误反馈、解析展示正确；主观题输入与提交正常',
        '错题自动收录：答错的题进入错题本，支持筛选、重练、移除',
        '任务与复习计划：任务进度环正确更新；复习计划「今日待复习」可进入；打卡记录生效',
        'AI 学习计划：基于答题数据生成个性化计划，骨架屏加载态正常，统计无 undefined 显示',
        '数据持久化：刷新后答题记录、错题、任务进度、学习计划仍保留',
    ]),
    ('四、数据与 AI 集成验证', [
        'AI 答疑可用：可正常提问并流式返回回答，快捷问题、清空会话正常',
        'AI 学情分析：可基于刷题数据生成分析与建议',
        '分数预测与志愿推荐：职业技能预测得分、冲/稳/保三档结果基于真实数据计算',
        '数据大屏与周报：图表（正确率趋势、答题量、科目分布）渲染正常；周报可导出 PDF（品牌色完整保留）',
        '图片与资源加载：题目配图（/qimages）、院校 Logo、成就分享二维码正常显示，无裂图',
    ]),
    ('五、PWA 离线化验证（重点）', [
        'Manifest 加载正常：DevTools → Application → Manifest 无报错，名称、主题色 #4f5ff0、图标 192/512 正确识别',
        'Service Worker 注册并接管：DevTools → Application → Service Workers 显示 springzhaokao-v1 已激活；控制台执行 navigator.serviceWorker.controller 返回非空',
        '预缓存完整：控制台执行 caches.open(\'springzhaokao-v1\').then(c=>c.keys()).then(ks=>ks.map(k=>k.url))，应包含 index.html、manifest.webmanifest、双图标及全部 /assets/*.js|css',
        '离线可打开应用外壳：DevTools 网络切 Offline 后刷新，应用外壳仍能渲染，不出现离线错误页',
        '添加到主屏幕：地址栏出现「安装」提示；安装后独立窗口启动，图标、名称、启动页正确，无地址栏',
        '版本更新机制：重新部署后刷新，SW 检测到新版本并更新缓存，旧缓存被清理',
    ]),
    ('六、响应式与多端验证', [
        '移动端（320–414px）：无横向溢出，抽屉菜单可用，可点区域 ≥ 44px',
        '平板（768–1024px）：卡片网格、图表、表格布局合理，无错位或挤压',
        '桌面（1280px+）：内容居中、留白均衡，导航完整显示',
        '深色背景可读性：知识图谱暗色抽屉、数据大屏深色面板文字对比度充足',
    ]),
    ('七、性能与体验验证', [
        '首屏加载：3G 下首屏资源加载完成 < 3s，无阻塞性大资源',
        '骨架屏与加载态：数据加载中显示骨架屏，无内容跳动或 undefined 闪烁',
        '减弱动效适配：系统开启「减弱动态效果」后动画/过渡被压制，不影响功能',
        '控制台无报错：遍历主要页面，Console 无 Uncaught、网络 4xx/5xx 报错',
    ]),
    ('八、安全与合规检查', [
        'HTTPS 全站：所有页面与资源均走 HTTPS，无混合内容警告',
        '无敏感信息泄露：前端产物中无 API Key、数据库口令等明文；接口不返回密码等敏感字段',
        '输入与 XSS 防护：昵称、AI 提问等用户输入经转义渲染，无脚本注入；表单校验生效',
        '错误处理友好：API 失败时显示空态/错误提示而非崩溃；AI 超时或失败有重试引导',
    ]),
    ('九、验收结论', [
        '全部检查项通过，无未解决阻断项',
        '填写验收人、验收日期、版本号，判定结论（通过 / 有条件通过 / 不通过）',
        '本清单与部署记录一并归档',
    ]),
]

TROUBLE_TABLE = [
    ['现象', '排查方向'],
    ['PWA 无法安装', '检查是否 HTTPS、manifest 是否可访问、图标是否 192/512'],
    ['SW 未接管页面', '检查 /sw.js 是否 200、是否生产环境（开发模式不注册）'],
    ['离线刷新白屏', '确认 index.html 已入预缓存、SPA 回退配置正确'],
    ['刷新子页 404', '服务器未配置 try_files $uri /index.html'],
    ['图片裂图', '检查 /qimages 代理与后端图片服务'],
    ['AI 无响应', '检查后端 DeepSeek Key 与超时配置'],
]

# ---------- 构建 ----------
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deployment-verification.pdf')
doc = SimpleDocTemplate(
    out_path, pagesize=A4,
    leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    title='云南春招智能学习平台 · 部署后验证步骤',
    author='云南春招智能学习平台',
    subject='部署后验证步骤清单',
)

W = doc.width
story = []

# ---------- 封面 ----------
story.append(Spacer(1, 0.5 * inch))
story.append(CoverBand(W, 6))
story.append(Spacer(1, 0.35 * inch))
story.append(Paragraph('云南春招智能学习平台', styles['title']))
story.append(Paragraph('部署后验证步骤', styles['title']))
story.append(Spacer(1, 0.2 * inch))
story.append(Paragraph('Deployment Verification Checklist', styles['subtitle']))
story.append(Spacer(1, 0.25 * inch))
story.append(Paragraph('面向部署 / 运维 / 测试人员的逐项验收手册 · 全部通过后即可对外发布', styles['meta']))
story.append(Spacer(1, 0.3 * inch))

meta_table = Table(
    [[Paragraph('<b>版本</b>', styles['meta']), Paragraph('v1.0', styles['meta']),
      Paragraph('<b>日期</b>', styles['meta']), Paragraph('2026-09-01', styles['meta'])]],
    colWidths=[0.9 * inch, 1.6 * inch, 0.9 * inch, 1.6 * inch],
)
meta_table.setStyle([
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TEXTCOLOR', (0, 0), (-1, -1), HexColor('#e6e8ff')),
])
story.append(meta_table)
story.append(Spacer(1, 0.4 * inch))

sign_table = Table(
    [[Paragraph('验收人：______________', styles['meta']),
      Paragraph('验收日期：______________', styles['meta']),
      Paragraph('版本号：______________', styles['meta'])]],
    colWidths=[W / 3.0] * 3,
)
sign_table.setStyle([
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
])
story.append(sign_table)
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph('结论：□ 通过　　□ 有条件通过　　□ 不通过', styles['meta']))
story.append(Spacer(1, 0.2 * inch))
story.append(CoverBand(W, 6))
story.append(Spacer(1, 0.5 * inch))
story.append(PageBreak())

# ---------- 正文 ----------
def add_section(title, items):
    story.append(Paragraph(title, styles['h1']))
    story.append(ColoredDivider(W * 0.3, 2, ACCENT, space_before=0, space_after=10))
    for it in items:
        story.append(Paragraph('%s&nbsp;&nbsp;%s' % (box_mark(), it), styles['item']))

for title, items in SECTIONS:
    add_section(title, items)

# ---------- PWA 注意事项 ----------
story.append(Paragraph('五、补充说明', styles['h1']))
story.append(ColoredDivider(W * 0.3, 2, ACCENT, space_before=0, space_after=10))
story.append(Paragraph(
    '<b>注意：</b>离线仅保证「应用外壳」可打开；登录后的数据（题库、错题、AI 结果等）来自后端 API，'
    '离线时无法获取，属预期行为。API 请求采用网络优先策略，弱网下自动回退缓存。',
    styles['note']))

# ---------- 常见问题排查表 ----------
story.append(Paragraph('十、常见问题排查', styles['h1']))
story.append(ColoredDivider(W * 0.3, 2, ACCENT, space_before=0, space_after=10))

tbl_data = [[Paragraph(c, ParagraphStyle('th', fontName=FONT, fontSize=10, leading=14,
                                         textColor=white, alignment=TA_LEFT, wordWrap='CJK'))
             for c in TROUBLE_TABLE[0]]]
for row in TROUBLE_TABLE[1:]:
    tbl_data.append([Paragraph(c, ParagraphStyle('td', fontName=FONT, fontSize=9.5, leading=14,
                                                 textColor=INK, alignment=TA_LEFT, wordWrap='CJK'))
                     for c in row])

tbl = LongTable(tbl_data, colWidths=[W * 0.32, W * 0.68], repeatRows=1)
tbl.setStyle([
    ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [BG_SOFT, white]),
    ('GRID', (0, 0), (-1, -1), 0.5, RULE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 7),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
])
story.append(KeepTogether([tbl]))

# ---------- 页脚 ----------
def on_page(canv, doc_):
    canv.saveState()
    canv.setFont(FONT, 8.5)
    canv.setFillColor(MUTED)
    canv.drawCentredString(A4[0] / 2, 0.35 * inch, '云南春招智能学习平台 · 部署后验证步骤　|　第 %d 页' % canv.getPageNumber())
    canv.restoreState()

doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print('PDF 已生成:', out_path)

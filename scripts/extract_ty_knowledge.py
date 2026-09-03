# -*- coding: utf-8 -*-
"""按"第X部分"提取 通用技术讲义 各章节知识点原文, 存为知识底座供 AI 出题。"""
from docx import Document
import re, json

SRC = r"E:\saixt\通用技术\2022-2023学年高中通用技术（2019）会考知识点复习讲义.docx"
OUT = r"E:\saixt\server\data\ty_knowledge.json"

PART = re.compile(r'^\s*第([一二三四五六七八九十]+)部分\s*(.*)$')
CHAPTER_MAP = {
    '第一部分': '技术的性质与作用',
    '第二部分': '设计的过程与评价',
    '第三部分': '设计图样与方案构思',
    '第四部分': '制作原型及模型',
    '第五部分': '结构与设计',
    '第六部分': '流程与设计',
    '第七部分': '系统与设计',
    '第八部分': '控制与设计',
}

d = Document(SRC)
chapters = {}          # part_key -> {'title','lines':[]}
order = []
cur = None
for p in d.paragraphs:
    t = p.text.strip()
    if not t:
        continue
    m = PART.match(t)
    if m:
        key = '第' + m.group(1) + '部分'
        cur = key
        if key not in chapters:
            chapters[key] = {'title': CHAPTER_MAP.get(key, t), 'lines': []}
            order.append(key)
        # 标题行本身
        chapters[key]['lines'].append(t)
        continue
    # 跳过封面/TOC噪音
    if len(t) < 2 or t.startswith('学校') or '姓名' in t:
        continue
    if cur:
        chapters[cur]['lines'].append(t)

data = {}
for key in order:
    c = chapters[key]
    text = '\n'.join(c['lines'])
    # 截断避免超长(最多~1800字/章)
    if len(text) > 1800:
        text = text[:1800]
    data[c['title']] = text
    print('%-14s 行数=%d 知识len=%d' % (c['title'], len(c['lines']), len(text)))

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
print('已写出:', OUT, ' 章节数:', len(data))

# 本地题库已有通用技术章节
from pathlib import Path
import sqlite3
con = sqlite3.connect(r'E:\saixt\server\data\saixt.db')
print('现库通用技术章节:', [r[0] for r in con.execute("SELECT DISTINCT chapter FROM questions WHERE subject='通用技术'").fetchall()])
con.close()
# -*- coding: utf-8 -*-
"""构建政治知识底座：从必修一~必修四考点解读提取知识点，映射到现有库4大主题章节。
   输出 pol_knowledge.json
"""
from docx import Document
import json, os, glob

BASE = r'E:\saixt\【学考复习】2024年高中政治学业水平考试必备考点归纳与测试（新教材 12份-3102547\考点解读'
# 讲义 -> 现有库主题章节
VOL_MAP = {
    '必修一': '专题01 《中国特色社会主义》',
    '必修二': '专题03 《经济与社会》',
    '必修三': '专题05 《政治与法治》',
    '必修四': '专题07 《哲学与文化》',
}

files = {}
for vol, topic in VOL_MAP.items():
    pat = os.path.join(BASE, f'*{vol}*考点解读*.docx')
    hits = glob.glob(pat)
    if not hits:
        print(f'[缺] 必修{vol}')
        continue
    files[vol] = hits[0]

result = {}
for vol, topic in VOL_MAP.items():
    fp = files.get(vol)
    if not fp:
        continue
    doc = Document(fp)
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    body = []
    for t in paras:
        # 跳过首部标题/页眉类行
        if t.startswith('★'):
            continue
        body.append(t)
    text = '\n'.join(body).strip()
    if len(text) > 8000:
        text = text[:8000]
    result[topic] = text
    print(f'[必修{vol}] {topic}, 知识 {len(text)} 字')

OUT = r'E:\saixt\server\data\pol_knowledge.json'
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print(f'\n已写出 {OUT}, 主题数 {len(result)}')
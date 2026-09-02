# -*- coding: utf-8 -*-
"""匹配31道图片题与提取的图片"""
import json, re, os

def norm(s):
    return re.sub(r'[\s（）()。，,、：:；;？?【】\[\]“”"\'．.]', '', str(s))

# 加载映射
with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)
with open(r'E:\saixt\server\public\qimages\_pdf_mapping.json', encoding='utf-8') as f:
    pdf_map = json.load(f)

# 加载31道图片题
data = json.load(open(r'E:\saixt\exam_papers\refined_image.json', encoding='utf-8'))
if isinstance(data, dict):
    data = data.get('questions', data.get('data', []))
still = [r for r in data if r.get('needs_image')]

# 文本文件名 -> 试卷文件名
SRC_MAP = {
    '110份.txt': '110份',
    '110份_(2).txt': '110份 (2)',
    '信息周测二（125份）.txt': '信息周测二（125份）',
    '信息周测五（65份）.txt': '信息周测五（65份）',
    '信息周测四（60份）.txt': '信息周测四（60份）',
    '周测五(65份).txt': '周测五(65份)',
    '通用周测一（10份）.txt': '通用周测一（10份）',
    '通用周测三(125份）.txt': '通用周测三(125份）',
    '通用周测四（60份）.txt': '通用周测四（60份）',
    '通用模拟测试题（130份）.txt': '通用模拟测试题（130份）',
}

def find_docx_block(source, stem):
    """在DOCX映射中查找包含题干关键词的块"""
    blocks = docx_map.get(source, [])
    key = norm(stem)[:30]
    best = None
    for i, b in enumerate(blocks):
        bt = norm(b['text'])
        if not bt:
            continue
        # 题干前20字在块文本中
        for L in (20, 15, 10, 6):
            sub = key[:L]
            if sub and sub in bt:
                best = (i, b)
                break
        if best:
            break
    return best

def find_pdf_page(source, stem):
    pages = pdf_map.get(source, [])
    key = norm(stem)[:30]
    for p in pages:
        pt = norm(p['text'])
        for L in (20, 15, 10, 6):
            sub = key[:L]
            if sub and sub in pt:
                return p
    return None

for idx, q in enumerate(still):
    src_txt = q['file']
    source = SRC_MAP.get(src_txt, src_txt.replace('.txt', ''))
    stem = q['stem']
    if source in docx_map:
        res = find_docx_block(source, stem)
        if res:
            bi, b = res
            # 收集本块及下一块的图片
            imgs = list(b['images'])
            if bi + 1 < len(docx_map[source]) and docx_map[source][bi+1]['text'].startswith('[表格]'):
                imgs += docx_map[source][bi+1]['images']
            print(f"[{idx+1}] {src_txt} -> 块{bi}: {b['text'][:40]}")
            print(f"    图片: {imgs}")
        else:
            print(f"[{idx+1}] {src_txt} -> 未匹配: {stem[:40]}")
    elif source in pdf_map:
        p = find_pdf_page(source, stem)
        if p:
            print(f"[{idx+1}] {src_txt} -> 第{p['page']}页: {p['text'][:60].replace(chr(10),' / ')}")
            print(f"    图片: {[im['path'] for im in p['images']]}")
        else:
            print(f"[{idx+1}] {src_txt} -> 未匹配: {stem[:40]}")
    else:
        print(f"[{idx+1}] {src_txt} -> 无此源")

# -*- coding: utf-8 -*-
"""v3：用最长公共子串匹配题目与块，图片含后续表格块"""
import json, re

def norm(s):
    return re.sub(r'[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]', '', str(s))

def lcs_len(a, b):
    """最长公共子串长度"""
    if not a or not b:
        return 0
    m, n = len(a), len(b)
    dp = [0] * (n + 1)
    best = 0
    for i in range(1, m + 1):
        prev = 0
        for j in range(1, n + 1):
            tmp = dp[j]
            if a[i - 1] == b[j - 1]:
                dp[j] = prev + 1
                if dp[j] > best:
                    best = dp[j]
            else:
                dp[j] = 0
            prev = tmp
    return best

with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)
with open(r'E:\saixt\server\public\qimages\_pdf_mapping.json', encoding='utf-8') as f:
    pdf_map = json.load(f)

data = json.load(open(r'E:\saixt\exam_papers\refined_image.json', encoding='utf-8'))
if isinstance(data, dict):
    data = data.get('questions', data.get('data', []))
still = [r for r in data if r.get('needs_image')]

SRC_MAP = {
    '110份.txt': '110份', '110份_(2).txt': '110份 (2)',
    '信息周测二（125份）.txt': '信息周测二（125份）',
    '信息周测五（65份）.txt': '信息周测五（65份）',
    '信息周测四（60份）.txt': '信息周测四（60份）',
    '周测五(65份).txt': '周测五(65份)',
    '通用周测一（10份）.txt': '通用周测一（10份）',
    '通用周测三(125份）.txt': '通用周测三(125份）',
    '通用周测四（60份）.txt': '通用周测四（60份）',
    '通用模拟测试题（130份）.txt': '通用模拟测试题（130份）',
}

def find_docx_best(source, stem):
    blocks = docx_map.get(source, [])
    key = norm(stem)
    best_i, best_score = -1, 0
    for i, b in enumerate(blocks):
        bt = norm(b['text'])
        if not bt:
            continue
        score = lcs_len(key, bt)
        if score > best_score:
            best_score, best_i = score, i
    return best_i, best_score

def collect_docx_imgs(source, bi):
    """收集块bi及后续表格块的图片"""
    blocks = docx_map.get(source, [])
    imgs = []
    # 本块
    for p in blocks[bi]['images']:
        if p not in imgs:
            imgs.append(p)
    # 前一块（图片常在题干前）
    if bi - 1 >= 0:
        for p in blocks[bi - 1]['images']:
            if p not in imgs:
                imgs.append(p)
    # 后续表格块
    for j in range(bi + 1, min(len(blocks), bi + 3)):
        if blocks[j]['text'].startswith('[表格]'):
            for p in blocks[j]['images']:
                if p not in imgs:
                    imgs.append(p)
            break
    return imgs

results = []
for idx, q in enumerate(still):
    src_txt = q['file']
    source = SRC_MAP.get(src_txt, src_txt.replace('.txt', ''))
    stem = q['stem']
    entry = {'idx': idx + 1, 'file': src_txt, 'subject': q.get('subject'), 'chapter': q.get('chapter'),
             'stem': stem, 'options': q.get('options', []), 'answer': q.get('answer', ''),
             'analysis': q.get('analysis', ''), 'images': []}
    if source in docx_map:
        bi, score = find_docx_best(source, stem)
        if bi >= 0 and score >= 8:
            entry['block'] = bi
            entry['score'] = score
            entry['block_text'] = docx_map[source][bi]['text'][:60]
            entry['images'] = collect_docx_imgs(source, bi)
    elif source in pdf_map:
        pages = pdf_map.get(source, [])
        key = norm(stem)
        best_p, best_score = -1, 0
        for p in pages:
            pt = norm(p['text'])
            score = lcs_len(key, pt)
            if score > best_score:
                best_score, best_p = score, p['page']
        entry['page'] = best_p
        entry['score'] = best_score
        if best_p > 0:
            entry['images'] = [im['path'] for im in pages[best_p - 1]['images']]
    results.append(entry)

with open(r'E:\saixt\exam_papers\image_match_review.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=1)

for e in results:
    print(f"[{e['idx']}] {e['file']} | 块{e.get('block','-')} 页{e.get('page','-')} 分{e.get('score','-')} | 图:{e['images']}")
    print(f"    题干: {e['stem'][:48]}")

# -*- coding: utf-8 -*-
"""改进版：匹配31道图片题与图片，搜索相邻块，输出复核清单"""
import json, re

def norm(s):
    return re.sub(r'[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]', '', str(s))

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
    """返回最佳块索引及得分"""
    blocks = docx_map.get(source, [])
    key = norm(stem)
    # 提取题干核心（去掉"如图所示"等）
    core = re.sub(r'如图所示|如图|下图|图中|根据图|据图', '', key)
    best_i, best_score = -1, 0
    for i, b in enumerate(blocks):
        bt = norm(b['text'])
        if not bt:
            continue
        score = 0
        # 题干前若干字符出现在块中
        for L in (24, 18, 12, 8, 5):
            sub = core[:L]
            if sub and sub in bt:
                score = L
                break
        if score > best_score:
            best_score, best_i = score, i
    return best_i, best_score

def collect_docx_imgs(source, bi, radius=2):
    """收集块bi前后radius范围内的图片"""
    blocks = docx_map.get(source, [])
    imgs = []
    for j in range(max(0, bi - radius), min(len(blocks), bi + radius + 1)):
        for p in blocks[j]['images']:
            if p not in imgs:
                imgs.append(p)
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
        if bi >= 0:
            entry['block'] = bi
            entry['block_text'] = docx_map[source][bi]['text'][:60]
            entry['images'] = collect_docx_imgs(source, bi)
    elif source in pdf_map:
        pages = pdf_map.get(source, [])
        key = norm(stem)
        core = re.sub(r'如图所示|如图|下图|图中|根据图|据图', '', key)
        best_p, best_score = -1, 0
        for p in pages:
            pt = norm(p['text'])
            for L in (24, 18, 12, 8, 5):
                sub = core[:L]
                if sub and sub in pt:
                    if L > best_score:
                        best_score, best_p = L, p['page']
                    break
        entry['page'] = best_p
        if best_p > 0:
            entry['images'] = [im['path'] for im in pages[best_p - 1]['images']]
    results.append(entry)

with open(r'E:\saixt\exam_papers\image_match_review.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=1)

for e in results:
    print(f"[{e['idx']}] {e['file']} | 块{e.get('block','-')} 页{e.get('page','-')} | 图:{e['images']}")
    print(f"    题干: {e['stem'][:50]}")

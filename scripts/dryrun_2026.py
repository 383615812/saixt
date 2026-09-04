# -*- coding: utf-8 -*-
"""好题汇编2026 + 单科2025真题分类汇编 dry-run 预演（不写库）"""
import os, re, sys, sqlite3, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

DB_PATH = r'E:\saixt\server\data\saixt.db'

# (来源标签, 根目录, 科目)
SOURCES = [
    ('好题汇编2026-语文', r'E:\saixt\【好题汇编】备战2026年高中语文学业水平合格考真题分类汇编（全国通用）', '语文'),
    ('好题汇编2026-数学', r'E:\saixt\【好题汇编】备战2026年高中数学学业水平合格考真题分类汇编（全国通用）', '数学'),
    ('好题汇编2026-英语', r'E:\saixt\【好题汇编】备战2026年高中英语学业水平合格考真题分类汇编（全国通用）', '英语'),
    ('好题汇编2026-物理', r'E:\saixt\【好题汇编】备战2026年高中物理学业水平合格考真题分类汇编（全国通用）', '物理'),
    ('好题汇编2026-化学', r'E:\saixt\【好题汇编】备战2026年高中化学学业水平合格考真题分类汇编（全国通用）', '化学'),
    ('好题汇编2026-生物', r'E:\saixt\【好题汇编】备战2026年高中生物学业水平合格考真题分类汇编（全国通用）', '生物'),
    ('好题汇编2026-历史', r'E:\saixt\【好题汇编】备战2026年高中历史学业水平合格考真题分类汇编（全国通用）', '历史'),
    ('好题汇编2026-地理', r'E:\saixt\【好题汇编】备战2026年高中地理学业水平合格考真题分类汇编（全国通用）', '地理'),
    ('好题汇编2026-政治', r'E:\saixt\【好题汇编】备战2026年高中政治学业水平合格考真题分类汇编（全国通用）', '政治'),
    ('真题2025-化学', r'E:\saixt\【化学】2025年高中学业水平合格考真题分类汇编', '化学'),
    ('真题2025-历史', r'E:\saixt\【历史】2025年高中学业水平合格考真题分类汇编', '历史'),
    ('真题2025-地理', r'E:\saixt\【地理】2025年高中学业水平合格考真题分类汇编', '地理'),
    ('真题2025-政治', r'E:\saixt\【政治】2025年高中学业水平合格考真题分类汇编', '政治'),
    ('真题2025-数学', r'E:\saixt\【数学】2025年高中学业水平合格考真题分类汇编', '数学'),
    ('真题2025-物理', r'E:\saixt\【物理】2025年高中学业水平合格考真题分类汇编', '物理'),
    ('真题2025-生物', r'E:\saixt\【生物】2025年高中学业水平合格考真题分类汇编', '生物'),
    ('真题2025-英语', r'E:\saixt\【英语】2025年高中学业水平合格考真题分类汇编', '英语'),
    ('真题2025-语文', r'E:\saixt\【语文】2025年高中学业水平合格考真题分类汇编', '语文'),
]

def chapter_of(path):
    name = os.path.basename(path)
    name = re.sub(r'（解析版）|（原卷版）|（知识梳理）|（考点精讲精练精练+实战训练）|（学考真题汇编）', '', name)
    m = re.match(r'\s*(专题\s*\d+\s*\+?\s*[^（（【\[]+?|[^号]{2,24}?)(?=（|（|【|\[|-|$)', name)
    if m:
        c = m.group(1).strip().lstrip('+ ').rstrip('+ -')
        return c[:30]
    c = re.sub(r'[-（(【\[]+.*$', '', name).strip()
    return c[:30] if c else '未命名'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    existing = collections.defaultdict(set)
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])
    con.close()
    print(f'现有库题干库装载完成\n')

    jobs = []
    for label, root, subject in SOURCES:
        if not os.path.isdir(root):
            print(f'[缺目录] {label}: {root}')
            continue
        for p, _, fs in os.walk(root):
            for f in fs:
                if not (f.endswith('.docx') and '解析' in f and '原卷' not in f):
                    continue
                jobs.append((os.path.join(p, f), subject, label))
    print('待解析 解析版 docx:', len(jobs))

    by_src = collections.defaultdict(lambda: {'files': 0, 'parsed': 0, 'pass': 0,
                                              'new_e': 0, 'new_all': 0, 'zero': 0})
    chapters = collections.defaultdict(collections.Counter)
    seen_new = {}
    reasons = collections.Counter()

    for i, (fp, subject, label) in enumerate(jobs):
        try:
            qs = parse_docx(fp, subject, chapter_of(fp))
        except Exception as e:
            reasons['异常:' + str(e)[:40]] += 1
            continue
        by_src[label]['files'] += 1
        if not qs:
            by_src[label]['zero'] += 1
        for q in qs:
            by_src[label]['parsed'] += 1
            if not quality_check(q):
                reasons['质量不过关'] += 1
                continue
            by_src[label]['pass'] += 1
            key = norm(q['stem'])[:50]
            if key and key in existing[subject]:
                continue
            by_src[label]['new_e'] += 1
            nk = (subject, key)
            if nk in seen_new:
                continue
            seen_new[nk] = True
            by_src[label]['new_all'] += 1
            chapters[subject][chapter_of(fp)] += 1
        if (i + 1) % 50 == 0:
            print(f'  进度 {i+1}/{len(jobs)} ...')

    print('\n===== 按来源 =====')
    print(f'{"来源":<16}{"文档":>4}{"0题":>4}{"解析题":>7}{"合格":>6}{"新增(existing)":>10}{"净新增":>8}')
    tot = {'files': 0, 'zero': 0, 'parsed': 0, 'pass': 0, 'new_e': 0, 'new_all': 0}
    for label, d in sorted(by_src.items(), key=lambda x: -x[1]['new_all']):
        print(f'{label:<16}{d["files"]:>4}{d["zero"]:>4}{d["parsed"]:>7}{d["pass"]:>6}{d["new_e"]:>10}{d["new_all"]:>8}')
        for k in tot:
            tot[k] += d[k]
    print(f'{"合计":<16}{tot["files"]:>4}{tot["zero"]:>4}{tot["parsed"]:>7}{tot["pass"]:>6}{tot["new_e"]:>10}{tot["new_all"]:>8}')

    print('\n===== 章节分布（净新增 Top 40）=====')
    flat = []
    for s, c in chapters.items():
        for ch, n in c.items():
            flat.append((n, s, ch))
    for n, s, ch in sorted(flat, reverse=True)[:40]:
        print(f'{n:>4}  {s}  {ch}')

    print('\n异常/过滤统计:', dict(reasons))

if __name__ == '__main__':
    main()

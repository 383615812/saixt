# -*- coding: utf-8 -*-
"""信息技术三大新来源 dry-run 预演（不写库）：
   1) G27-高中信息技术学考复习（全国通用）      （专题01-11 + 2026模拟卷）
   2) 高中信息技术...总复习（全国通用）          （2025专题01-11 + 真题分类汇编专题01-11）
   3) E:\saixt\信息技术                          （知识点 + 模拟卷）
   统计：解析题数 / 质量合格 / 与现库去重后新增 / 新资料内部去重后净新增 / 章节分布 / 0-parse 文件
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

DB_PATH = r'E:\saixt\server\data\saixt.db'

SOURCES = [
    ('G27专题+模拟卷',
     r'E:\saixt\G27-高中信息技术学考复习（全国通用）'),
    ('总复习2025',
     r'E:\saixt\高中信息技术学业水平考试与学业水平合格考总复习（全国通用）'),
    ('信息技术目录',
     r'E:\saixt\信息技术'),
]

def chapter_of(path):
    name = os.path.basename(path)
    name = re.sub(r'（解析版）|（原卷版）|（知识梳理）|（考点精讲精练精练+实战训练）', '', name)
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

    jobs = []  # (path, subject, source)
    for label, root in SOURCES:
        if not os.path.isdir(root):
            print(f'[缺目录] {label}: {root}')
            continue
        for p, _, fs in os.walk(root):
            for f in fs:
                if not (f.endswith('.docx') and '解析' in f and '原卷' not in f):
                    continue
                jobs.append((os.path.join(p, f), '信息技术', label))
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
    print(f'{"来源":<12}{"文档":>4}{"0题文件":>6}{"解析题":>7}{"合格":>6}{"新增(existing)":>10}{"净新增":>8}')
    tot = {'files': 0, 'zero': 0, 'parsed': 0, 'pass': 0, 'new_e': 0, 'new_all': 0}
    for label, d in by_src.items():
        print(f'{label:<12}{d["files"]:>4}{d["zero"]:>6}{d["parsed"]:>7}{d["pass"]:>6}{d["new_e"]:>10}{d["new_all"]:>8}')
        for k in tot:
            tot[k] += d[k]
    print(f'{"合计":<12}{tot["files"]:>4}{tot["zero"]:>6}{tot["parsed"]:>7}{tot["pass"]:>6}{tot["new_e"]:>10}{tot["new_all"]:>8}')

    print('\n===== 章节分布（净新增）=====')
    flat = []
    for s, c in chapters.items():
        for ch, n in c.items():
            flat.append((n, s, ch))
    for n, s, ch in sorted(flat, reverse=True)[:40]:
        print(f'{n:>4}  {s}  {ch}')

    print('\n异常/过滤统计:', dict(reasons))

if __name__ == '__main__':
    main()

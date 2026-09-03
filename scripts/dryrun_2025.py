# -*- coding: utf-8 -*-
"""干跑评估：【XX】2025年真题分类汇编 系列 可导入的净新增合格题量。
复用 import_haoti_2026 的解析器，质量过滤 + 对现库(科目+题干前50字)去重，不写库。
"""
import os, re, sys, sqlite3, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check

DB_PATH = r'E:\saixt\server\data\saixt.db'

ROOTS = {
    '化学': '【化学】2025年高中学业水平合格考真题分类汇编',
    '历史': '【历史】2025年高中学业水平合格考真题分类汇编',
    '地理': '【地理】2025年高中学业水平合格考真题分类汇编',
    '政治': '【政治】2025年高中学业水平合格考真题分类汇编',
    '数学': '【数学】2025年高中学业水平合格考真题分类汇编',
    '物理': '【物理】2025年高中学业水平合格考真题分类汇编',
    '生物': '【生物】2025年高中学业水平合格考真题分类汇编',
    '英语': '【英语】2025年高中学业水平合格考真题分类汇编',
    '语文': '【语文】2025年高中学业水平合格考真题分类汇编',
}

def chapter_of(path):
    name = os.path.basename(path)
    name = re.sub(r'（解析版）|（原卷版）', '', name)
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
    existing = collections.defaultdict(set)
    for subj, stem in con.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])
    con.close()

    jobs = []
    for subject, root in ROOTS.items():
        rp = os.path.join(BASE, root)
        if not os.path.isdir(rp):
            print('缺目录', rp); continue
        n = 0
        for p, _, fs in os.walk(rp):
            for f in fs:
                if f.endswith('.docx') and '解析' in f and '原卷' not in f:
                    jobs.append((os.path.join(p, f), subject))
                    n += 1
        print(f'  {subject}: 解析版 {n} 个')

    print('\n待解析 解析版 docx 总数:', len(jobs))
    by_subject = collections.Counter()
    reasons = collections.Counter()
    seen_new = set()
    chapters = collections.defaultdict(set)
    for i, (fp, subject) in enumerate(jobs):
        try:
            qs = parse_docx(fp, subject, chapter_of(fp))
        except Exception as e:
            reasons['异常:' + str(e)[:40]] += 1
            continue
        for q in qs:
            if not quality_check(q):
                reasons['质量不过关'] += 1
                continue
            key = norm(q['stem'])[:50]
            if not key or key in existing[subject] or (subject, key) in seen_new:
                reasons['与现库/内部重复'] += 1
                continue
            seen_new.add((subject, key))
            by_subject[subject] += 1
            chapters[subject].add(chapter_of(fp))
        if (i + 1) % 30 == 0:
            print(f'  进度 {i+1}/{len(jobs)} ...')
    print('\n===== 2025真题分类汇编 可净新增 =====')
    tot = 0
    for s, c in by_subject.most_common():
        print(f'  {c:5}  {s}  (章节数 {len(chapters[s])})')
        tot += c
    print('净新增合计:', tot)
    print('过滤原因:', dict(reasons))

if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""好题汇编2026 净新增题导入（精确去重：完整归一化题干）：
   1) 解析全部 好题汇编2026 解析版 docx
   2) 质量过滤
   3) 与现库(完整归一化题干)去重 + 批内去重
   4) 仅插入净新增
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

DB_PATH = r'E:\saixt\server\data\saixt.db'

SUBJECT_DIRS = {
    '语文': '【好题汇编】备战2026年高中语文学业水平合格考真题分类汇编（全国通用）',
    '数学': '【好题汇编】备战2026年高中数学学业水平合格考真题分类汇编（全国通用）',
    '英语': '【好题汇编】备战2026年高中英语学业水平合格考真题分类汇编（全国通用）',
    '物理': '【好题汇编】备战2026年高中物理学业水平合格考真题分类汇编（全国通用）',
    '化学': '【好题汇编】备战2026年高中化学学业水平合格考真题分类汇编（全国通用）',
    '生物': '【好题汇编】备战2026年高中生物学业水平合格考真题分类汇编（全国通用）',
    '历史': '【好题汇编】备战2026年高中历史学业水平合格考真题分类汇编（全国通用）',
    '地理': '【好题汇编】备战2026年高中地理学业水平合格考真题分类汇编（全国通用）',
    '政治': '【好题汇编】备战2026年高中政治学业水平合格考真题分类汇编（全国通用）',
}

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
        existing[subj].add(norm(stem))
    print(f'现有库题干库装载完成\n')

    jobs = []
    for subject, dirname in SUBJECT_DIRS.items():
        dirpath = os.path.join(BASE, dirname)
        if not os.path.isdir(dirpath):
            print(f'[缺目录] {subject}: {dirname}')
            continue
        for p, _, fs in os.walk(dirpath):
            for f in fs:
                if f.endswith('.docx') and '解析' in f and '原卷' not in f:
                    jobs.append((os.path.join(p, f), subject))
    print('待解析 解析版 docx:', len(jobs))

    seen_new = {}
    rows = []          # 待插入行
    by_subject = collections.Counter()
    by_chapter = collections.Counter()
    reasons = collections.Counter()

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
            key = norm(q['stem'])
            if not key or key in existing[subject]:
                continue
            nk = (subject, key)
            if nk in seen_new:
                continue
            seen_new[nk] = True
            qtype = qtype_of(q)
            opts_json = json.dumps(q['options'], ensure_ascii=False)
            source = q.get('source', '') or '2026好题汇编'
            rows.append((subject, chapter_of(fp), qtype, 2, q['stem'], opts_json, q['answer'], q['analysis'], source))
            by_subject[subject] += 1
            by_chapter[(subject, chapter_of(fp))] += 1
        if (i + 1) % 50 == 0:
            print(f'  进度 {i+1}/{len(jobs)} ...')

    print(f'\n净新增: {len(rows)} 题')
    print('按科目:', dict(by_subject))
    print('\n按章节 Top 20:')
    for (s, ch), n in by_chapter.most_common(20):
        print(f'{n:>4}  {s}  {ch}')
    print('\n过滤统计:', dict(reasons))

    if not rows:
        print('\n无新增，退出')
        con.close()
        return

    cur.executemany(
        'INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)',
        rows)
    con.commit()
    total = cur.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
    con.close()
    print(f'\n已插入 {len(rows)} 题，题库总数: {total}')

if __name__ == '__main__':
    main()

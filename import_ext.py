# -*- coding: utf-8 -*-
"""导入三大新来源可净新增题目（历史 2056 + 化学 441 ≈ 2497 题）：
   1) 知识扩展库  E:\saixt\(48)...\赠：会考知识扩展库   （9 科目，按子目录名推断）
   2) 化学真题汇编 E:\saixt\化学高中学业水平合格性考试...  （化学）
   3) 历史真题汇编 E:\saixt\历史高中学业水平合格性考试...  （历史）
   去重逻辑与 dryrun_ext.py 完全一致：质量过滤 + 同科目题干前50字与现库去重 + 新资料内部去重。
   章节名在导入时清理（去 .docx 尾缀、压缩空格、截断 30 字符）。
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

DB_PATH = r'E:\saixt\server\data\saixt.db'

SOURCES = [
    ('知识扩展库',
     r'E:\saixt\(48)高中数学英语文生物理史地政化学业水平合格性考试知识点电子复习\赠：会考知识扩展库',
     None),
    ('化学真题汇编',
     r'E:\saixt\化学高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子',
     '化学'),
    ('历史真题汇编',
     r'E:\saixt\历史高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子',
     '历史'),
]

SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']

def clean_chapter(path):
    name = os.path.splitext(os.path.basename(path))[0]
    name = re.sub(r'（解析版）|（原卷版）|（知识梳理）|（考点精讲精练精练+实战训练）', '', name)
    m = re.match(r'\s*(专题\s*\d+\s*\+?\s*[^（（【\[]+?|[^号]{2,24}?)(?=（|（|【|\[|-|$)', name)
    if m:
        c = m.group(1).strip().lstrip('+ ').rstrip('+ -')
    else:
        c = re.sub(r'[-（(【\[]+.*$', '', name).strip()
    c = re.sub(r'\s+', ' ', c).strip()
    return c[:30] if c else '未命名'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def main():
    con = sqlite3.connect(DB_PATH)
    con.execute('PRAGMA busy_timeout=8000')
    con.execute('BEGIN IMMEDIATE')
    cur = con.cursor()
    existing = collections.defaultdict(set)
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])
    print('现有库题干库装载完成')

    jobs = []
    for label, root, fixed_subj in SOURCES:
        if not os.path.isdir(root):
            print(f'[缺目录] {label}: {root}')
            continue
        for p, _, fs in os.walk(root):
            for f in fs:
                if not (f.endswith('.docx') and '解析' in f and '原卷' not in f):
                    continue
                if fixed_subj:
                    subj = fixed_subj
                else:
                    rel = os.path.relpath(p, root)
                    seg = rel.split(os.sep)[0] if rel != '.' else ''
                    subj = seg if seg in SUBJECTS else '未分类'
                jobs.append((os.path.join(p, f), subj, label))
    print('待解析 解析版 docx:', len(jobs))

    by_subject = collections.Counter()
    by_source = collections.Counter()
    chapters = collections.defaultdict(collections.Counter)
    seen = set()
    imported = 0
    skipped_dup = 0
    skipped_quality = 0
    skipped_err = 0

    for i, (fp, subject, label) in enumerate(jobs):
        try:
            qs = parse_docx(fp, subject, clean_chapter(fp))
        except Exception as e:
            skipped_err += 1
            continue
        for q in qs:
            if not quality_check(q):
                skipped_quality += 1
                continue
            key = norm(q['stem'])[:50]
            if not key or key in existing[subject] or (subject, key) in seen:
                skipped_dup += 1
                continue
            seen.add((subject, key))
            qtype = qtype_of(q)
            src = q.get('source') or os.path.basename(fp)
            cur.execute(
                "INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)",
                (subject, clean_chapter(fp), qtype, 2, q['stem'],
                 json.dumps(q['options'], ensure_ascii=False), q['answer'], q['analysis'] or '', src)
            )
            by_subject[subject] += 1
            by_source[label] += 1
            chapters[subject][clean_chapter(fp)] += 1
            imported += 1
        if (i + 1) % 100 == 0:
            print(f'  进度 {i+1}/{len(jobs)} 已导入 {imported}')

    con.commit()
    con.close()
    print('\n===== 导入完成 =====')
    print('按来源:')
    for s, c in by_source.most_common():
        print(f'  {s:<8} {c:>5}')
    print('按科目:')
    for s, c in by_subject.most_common():
        print(f'  {s:<6} {c:>5}')
    print(f'本次净新增: {imported}')
    print(f'跳过: 质量 {skipped_quality}, 重复 {skipped_dup}, 异常 {skipped_err}')

if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""导入 信息技术/通用技术 真实试卷(真题/模拟/必刷)到题库。
解析: scripts.paper_parse  ; 去重: 科目+题干前50字  ; 归入 chapter='真题综合'。
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from scripts.paper_parse import parse_docx, quality_check

DB_PATH = r'E:\saixt\server\data\saixt.db'
FILES = r'E:\saixt\信息技术\信息技术试题'


def norm(s):
    return re.sub(r'\s+', '', s or '')


def main():
    con = sqlite3.connect(DB_PATH)
    con.execute('PRAGMA busy_timeout=5000')
    con.execute('BEGIN IMMEDIATE')
    cur = con.cursor()
    existing = collections.defaultdict(set)
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])

    files = []
    for p, _, fs in os.walk(FILES):
        for f in fs:
            if f.endswith('.docx') and not re.search(r'\(\d\)\.docx$', os.path.basename(f)) \
               and '解析' not in f:
                files.append(os.path.join(p, f))
    print('待解析 docx:', len(files))

    by_subj = collections.Counter()
    chapters = collections.defaultdict(collections.Counter)
    seen = set()
    imported = 0
    for fp in files:
        subj = '通用技术' if '通用技术' in fp else '信息技术'
        try:
            qs = parse_docx(fp)
        except Exception as e:
            print('异常', os.path.basename(fp), e)
            continue
        for q in qs:
            if not quality_check(q):
                continue
            key = norm(q['stem'])[:50]
            if not key or key in existing[subj] or (subj, key) in seen:
                continue
            seen.add((subj, key))
            src = q.get('source') or os.path.basename(fp)
            cur.execute(
                "INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)",
                (subj, '真题综合', 'single', 2, q['stem'],
                 json.dumps(q['options'], ensure_ascii=False), q['answer'], q['analysis'] or '', src)
            )
            by_subj[subj] += 1
            chapters[subj]['真题综合'] += 1
            imported += 1
    con.commit()
    con.close()
    print('\n===== 导入完成 =====')
    for s, c in by_subj.most_common():
        print(f'  净新增 {c:4}  {s}')
    print('本次净新增合计:', imported)


if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""导入 AI 生成的数学 + 政治补强题到本地题库（含题干去重）。
   数学/政治章节名由知识底座直接对齐库中章节名，无需额外映射。"""
import json, re, sqlite3, collections

DB = r'E:\saixt\server\data\saixt.db'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def load_existing(con):
    d = collections.defaultdict(set)
    for subj, stem in con.execute('SELECT subject, stem FROM questions'):
        d[subj].add(norm(stem))
    return d

def import_json(con, path, subject, existing):
    qs = json.load(open(path, encoding='utf-8'))
    seen = set()
    by_ch = collections.Counter()
    total = 0
    SQL = ("INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) "
           "VALUES (?,?,?,?,?,?,?,?,?)")
    for q in qs:
        ch = q['chapter']
        key = (subject, norm(q['stem']))
        if key in existing[subject] or key in seen:
            continue
        seen.add(key)
        con.execute(SQL, (subject, ch, 'single', 2, q['stem'],
                          json.dumps(q['options'], ensure_ascii=False),
                          q['answer'].upper(), q['analysis'] or '', 'AI生成补强'))
        by_ch[ch] += 1
        total += 1
    print(f'[{subject}] 新增 {total} 题')
    for c, n in by_ch.most_common():
        print(f'  {n:4}  {c}')
    return total

con = sqlite3.connect(DB)
con.execute('PRAGMA busy_timeout=8000')
cur = con.cursor()
existing = load_existing(con)

con.execute('BEGIN IMMEDIATE')
try:
    m = import_json(con, r'E:\saixt\server\data\generated_math_questions.json', '数学', existing)
    p = import_json(con, r'E:\saixt\server\data\generated_pol_questions.json', '政治', existing)
    con.commit()
    print(f'\n本次新增：数学 {m} 题, 政治 {p} 题')
except Exception as e:
    con.rollback()
    raise e

total = cur.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
for s in ('数学', '政治'):
    c = cur.execute('SELECT COUNT(*) FROM questions WHERE subject=?', (s,)).fetchone()[0]
    print(f'{s} 题数: {c}')
print('本地题库总数:', total)
con.close()
# -*- coding: utf-8 -*-
"""导入 AI 生成的通用技术题到本地题库。来源=AI生成-通用技术会考。"""
import json, re, sqlite3, collections

GEN = r'E:\saixt\server\data\generated_ty_questions.json'
DB = r'E:\saixt\server\data\saixt.db'
SUBJECT = '通用技术'
TYPE = 'single'
SOURCE = 'AI生成-通用技术会考'

def norm(s): return re.sub(r'\s+', '', s or '')

qs = json.load(open(GEN, encoding='utf-8'))
con = sqlite3.connect(DB)
con.execute('PRAGMA busy_timeout=5000')
cur = con.cursor()
existing = set()
for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
    existing.add((subj, norm(stem)[:50]))

by_ch = collections.Counter()
seen = set()
SQL = "INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)"
total = 0
for q in qs:
    key = (SUBJECT, norm(q['stem'])[:50])
    if key in existing or key in seen:
        continue
    seen.add(key)
    cur.execute(SQL, (SUBJECT, q['chapter'], TYPE, 2, q['stem'],
                 json.dumps(q['options'], ensure_ascii=False), q['answer'].upper(),
                 q['analysis'] or '', SOURCE))
    by_ch[q['chapter']] += 1
    total += 1
con.commit()
con.close()
print('本地导入完成, 新增', total)
for c, n in by_ch.most_common():
    print(f'  {n:4}  {c}')
# 更新总库数
con = sqlite3.connect(DB)
t = con.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
g = con.execute("SELECT COUNT(*) FROM questions WHERE subject='通用技术'").fetchone()[0]
print('本地题库总数:', t, ' 通用技术:', g)
con.close()
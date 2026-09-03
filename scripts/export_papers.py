# -*- coding: utf-8 -*-
"""导出本轮试卷导入新增行(基线=导入前本地备份), 供生产增量迁移。"""
import sqlite3, re, json

BACKUP = r'E:\saixt\server\data\saixt.db.bak-before-papers'
CUR = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\server\data\new_questions_papers.json'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def load_keys(path):
    con = sqlite3.connect(path); cur = con.cursor()
    keys = set()
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        keys.add((subj, norm(stem)[:50]))
    con.close(); return keys

bak = load_keys(BACKUP)
con = sqlite3.connect(CUR); con.row_factory = sqlite3.Row
rows = con.execute('SELECT id, subject, chapter, type, difficulty, stem, options, answer, analysis, source FROM questions').fetchall()
new_rows = [dict(r) for r in rows if (r['subject'], norm(r['stem'])[:50]) not in bak and (r['stem'] or '').strip()]
seen = set(); uniq = 0; dup = 0
for r in new_rows:
    k = (r['subject'], norm(r['stem'])[:50])
    if k in seen: dup += 1; continue
    seen.add(k); uniq += 1
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'count': len(new_rows), 'unique': uniq, 'rows': new_rows}, f, ensure_ascii=False)
print('导出新增行:', len(new_rows), ' 唯一:', uniq, ' 内重:', dup)
print('章节分布:', dict(__import__('collections').Counter(r['chapter'] for r in new_rows)))
con.close()
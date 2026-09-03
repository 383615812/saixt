# -*- coding: utf-8 -*-
"""导出本地新增题目行（相对导入前备份去重键比对），供增量迁移到生产。
   只包含 backup 中不存在的 (subject, norm(stem)[:50]) 对应行。
"""
import sqlite3, re, json

BACKUP = r'E:\saixt\server\data\saixt.db.bak-newmaterials-20260903_1346'
CUR = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\server\data\new_questions_export.json'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def load_keys(path):
    con = sqlite3.connect(path)
    cur = con.cursor()
    keys = set()
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        keys.add((subj, norm(stem)[:50]))
    con.close()
    return keys

print('加载备份键集...')
bak = load_keys(BACKUP)
print('  backup 键数:', len(bak))

con = sqlite3.connect(CUR)
con.row_factory = sqlite3.Row
cur = con.cursor()
rows = cur.execute('SELECT id, subject, chapter, type, difficulty, stem, options, answer, analysis, source FROM questions').fetchall()
print('当前总行数:', len(rows))

new_rows = []
dup = 0
for r in rows:
    if (r['subject'], norm(r['stem'])[:50]) in bak:
        continue
    if not (r['stem'] or '').strip():
        continue
    new_rows.append(dict(r))
print('相对备份新增行数:', len(new_rows), ' (期望 ≈9144)')

# 验证新增行自身键不重复
seen = set()
uniq = 0
for r in new_rows:
    k = (r['subject'], norm(r['stem'])[:50])
    if k in seen:
        dup += 1
        continue
    seen.add(k)
    uniq += 1
print(' 去重后新增键数:', uniq, ' 内部重复:', dup)

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'count': len(new_rows), 'unique': uniq, 'rows': new_rows}, f, ensure_ascii=False)
print('已写出:', OUT)
con.close()
# -*- coding: utf-8 -*-
"""导出本次 2026好题汇编 新增题（相对导入前备份），供生产增量导入。"""
import sqlite3, re, json

BACKUP = r'E:\saixt\server\data\backup_saixt_20260904_080612.db'
CUR = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\server\data\new_questions_2026.json'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def load_keys(path):
    con = sqlite3.connect(path)
    cur = con.cursor()
    keys = set()
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        keys.add((subj, norm(stem)))
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
for r in rows:
    if (r['subject'], norm(r['stem'])) in bak:
        continue
    if not (r['stem'] or '').strip():
        continue
    new_rows.append(dict(r))
print('相对备份新增行数:', len(new_rows))

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'count': len(new_rows), 'rows': new_rows}, f, ensure_ascii=False)
print('已写出:', OUT)
con.close()

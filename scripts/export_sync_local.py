# -*- coding: utf-8 -*-
"""导出本地有、生产没有的题（完整题干键对比）为 JSON，供生产导入"""
import sqlite3, re, collections, json

LOCAL = r'E:\saixt\server\data\saixt.db'
PROD  = r'E:\saixt\server\data\saixt_prod4.db'
OUT   = r'E:\saixt\scripts\sync_local_to_prod.json'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def load(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    rows = con.execute('SELECT subject, chapter, type, difficulty, stem, options, answer, analysis, source FROM questions').fetchall()
    con.close()
    return rows

l_rows = load(LOCAL)
p_rows = load(PROD)
p_keys = collections.Counter((r['subject'], norm(r['stem'])) for r in p_rows)

rows = []
seen = set()
for r in l_rows:
    key = (r['subject'], norm(r['stem']))
    if p_keys[key] == 0 and key not in seen:
        seen.add(key)
        rows.append(dict(r))

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'rows': rows}, f, ensure_ascii=False, indent=1)

by_subj = collections.Counter(r['subject'] for r in rows)
print(f'导出 {len(rows)} 条 -> {OUT}')
for s, c in by_subj.most_common():
    print(f'  {s}: {c}')

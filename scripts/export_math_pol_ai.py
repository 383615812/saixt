# -*- coding: utf-8 -*-
"""导出本地 source='AI生成补强' 且 subject in (数学,政治) 的题到 JSON，供生产同步导入。"""
import json, sqlite3

DB = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\scripts\sync_math_pol_new.json'

con = sqlite3.connect(DB)
cur = con.cursor()
rows = cur.execute(
    "SELECT subject, chapter, type, difficulty, stem, options, answer, analysis, source "
    "FROM questions WHERE source='AI生成补强' AND subject IN ('数学','政治')"
).fetchall()
data = {
    'exported_at': '2026-09-04',
    'count': len(rows),
    'rows': [
        {'subject': r[0], 'chapter': r[1], 'type': r[2], 'difficulty': r[3],
         'stem': r[4], 'options': r[5], 'answer': r[6], 'analysis': r[7], 'source': r[8]}
        for r in rows
    ]
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
from collections import Counter
print('导出总数:', len(rows))
for subj, n in Counter(r[0] for r in rows).items():
    print(f'  {subj}: {n}')
print('写入:', OUT)
con.close()
# -*- coding: utf-8 -*-
"""导出本次导入的 2497 题（id > 25780）为生产同步 JSON。
   供 prod_import_questions.cjs 增量迁移到生产。
"""
import sqlite3, json

DB = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\server\data\ext_questions_export.json'
THRESHOLD = 25780

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
rows = cur.execute(
    'SELECT id, subject, chapter, type, difficulty, stem, options, answer, analysis, source '
    'FROM questions WHERE id > ? ORDER BY id', (THRESHOLD,)
).fetchall()
con.close()

data = {'count': len(rows), 'rows': [dict(r) for r in rows]}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
print(f'导出 {len(rows)} 题 -> {OUT}')
print(f'历史: {sum(1 for r in rows if r["subject"]=="历史")}, 化学: {sum(1 for r in rows if r["subject"]=="化学")}')

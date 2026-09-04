# -*- coding: utf-8 -*-
"""导出本轮 AI 补强新增题（来源=AI生成补强）供生产增量导入。"""
import sqlite3, json
DB = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\server\data\new_ai_boost.json'
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
rows = cur.execute("SELECT subject, chapter, type, difficulty, stem, options, answer, analysis, source FROM questions WHERE source='AI生成补强'").fetchall()
data = [dict(r) for r in rows]
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'count': len(data), 'rows': data}, f, ensure_ascii=False)
from collections import Counter
print('导出题数:', len(data), dict(Counter(r['subject'] for r in data)))
print('已写出:', OUT)
con.close()
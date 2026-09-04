# -*- coding: utf-8 -*-
"""从运行库导出规范 schools.json（含 estimate_score/nature/flagship，校名已去民办前缀）。"""
import sqlite3, json
DB = r'E:\saixt\server\data\saixt.db'
OUT = r'E:\saixt\server\data\schools.json'
con = sqlite3.connect(DB)
rows = con.execute('SELECT code,name,plans,majors,tuition_range,estimate_score,nature,flagship FROM schools').fetchall()
con.close()
schools = [{
    'code': r[0], 'name': r[1], 'plans': r[2], 'majors': r[3],
    'tuition_range': r[4] or '', 'estimate_score': r[5] or '',
    'nature': r[6] or '', 'flagship': r[7] or '',
} for r in rows]
schools.sort(key=lambda s: s['code'])
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(schools, f, ensure_ascii=False, indent=1)
print('schools.json 已导出 %d 所，样例:' % len(schools))
for s in schools[:3]:
    print('  ', s)
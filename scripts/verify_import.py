# -*- coding: utf-8 -*-
"""导入后验证：总数/科目/题型/完整性/去重/重复检测/抽样"""
import sqlite3, re, json, collections
DB = r'E:\saixt\server\data\saixt.db'
con = sqlite3.connect(DB)
cur = con.cursor()

cur.execute('SELECT COUNT(*) FROM questions')
print('总题量:', cur.fetchone()[0])

print('\n-- 各科目 题量 / 题型分布(单/多/判/主) --')
cur.execute('''SELECT subject, type, COUNT(*) FROM questions GROUP BY subject, type''')
agg = collections.defaultdict(lambda: collections.Counter())
for s, t, c in cur.fetchall():
    agg[s][t] = c
tot = collections.Counter()
for s, c in sorted(agg.items(), key=lambda x: -sum(x[1].values())):
    n = sum(c.values())
    print(f'  {n:6}  {s:<6} 单/c selección={c.get("single",0)} 多={c.get("multiple",0)} 判={c.get("judge",0)} 主={c.get("subjective",0)}')

print('\n-- 完整性检查 --')
for col in ['stem', 'answer', 'chapter', 'subject']:
    cur.execute(f'SELECT COUNT(*) FROM questions WHERE {col} IS NULL OR TRIM({col})=\'\'')
    print(f'  空 {col}:', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM questions WHERE TRIM(analysis)='' OR analysis IS NULL")
print('  空/缺 analysis:', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM questions WHERE length(stem)<5")
print('  题干<5字:', cur.fetchone()[0])

print('\n-- 重复检测（规范化题干前50字 同科目） --')
cur.execute('''SELECT subject, REPLACE(REPLACE(stem,' ',''),CHAR(9),'') k, COUNT(*) c FROM questions
               GROUP BY subject, k HAVING c>1''')
rows = cur.fetchall()
dupe = sum(r[2] - 1 for r in rows)
print('  有重复的键组数:', len(rows), ' 超额重复行数:', dupe)
for r in rows[:5]:
    print('   ', r[0], 'x%d' % r[2], r[1][:30])

print('\n-- 新来源 source 覆盖 --')
cur.execute("SELECT source, COUNT(*) FROM questions GROUP BY source ORDER BY COUNT(*) DESC")
for s, c in cur.fetchall():
    print(f'  {c:6}  {s}')

print('\n-- 新章节抽样（新来源每科前5章节） --')
cur.execute('''SELECT subject, chapter, COUNT(*) c FROM questions
WHERE source LIKE '2026%' GROUP BY subject, chapter ORDER BY c DESC''')
by = collections.defaultdict(list)
for s, ch, c in cur.fetchall():
    by[s].append((ch, c))
for s, lst in list(by.items())[:3]:
    print(f'  [{s}]')
    for ch, c in lst[:5]:
        print(f'      {c:4} {ch}')

print('\n-- 抽样 4 条新题 --')
cur.execute("SELECT subject, chapter, type, substr(stem,1,50), answer, substr(analysis,1,40) FROM questions WHERE source LIKE '2026%' AND type!='subjective' LIMIT 4")
for row in cur.fetchall():
    print('  ', row[0], '/', row[1], '/', row[2])
    print('      题干:', row[3])
    print('      答案:', row[4], ' 解析:', row[5])
con.close()
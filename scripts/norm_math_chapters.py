# -*- coding: utf-8 -*-
"""数学章节名归一化：统一逗号差异 + 合并同专题的幂函数章"""
import sqlite3
DB = r'E:\saixt\server\data\saixt.db'
con = sqlite3.connect(DB)
cur = con.cursor()
con.execute('BEGIN IMMEDIATE')
# 1) 逗号差异统一
n = cur.execute("SELECT COUNT(*) FROM questions WHERE subject='数学' AND chapter='专题02 一元二次函数，方程和不等式'").fetchone()[0]
if n:
    cur.execute("UPDATE questions SET chapter='专题02 一元二次函数、方程和不等式' WHERE subject='数学' AND chapter='专题02 一元二次函数，方程和不等式'")
    print(f'专题02 逗号差异合并 ({n})')
# 2) 专题04 两章合并（幂函数并入主章）
n = cur.execute("SELECT COUNT(*) FROM questions WHERE subject='数学' AND chapter='专题04 指数函数、对数函数和幂函数'").fetchone()[0]
if n:
    cur.execute("UPDATE questions SET chapter='专题04 指数函数与对数函数' WHERE subject='数学' AND chapter='专题04 指数函数、对数函数和幂函数'")
    print(f'专题04 幂函数章并入主章 ({n})')
con.commit()
print('\n===== 数学最终章节(专题) =====')
for r in cur.execute("SELECT chapter, COUNT(*) FROM questions WHERE subject='数学' AND chapter LIKE '%专题%' GROUP BY chapter ORDER BY chapter").fetchall():
    print(f'{r[1]:>4}  [{r[0]}]')
con.close()
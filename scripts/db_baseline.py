# -*- coding: utf-8 -*-
"""查询数据库现状：科目/题量/章节覆盖，判断新资料去重与新增空间"""
import sqlite3, sys
DB = r'E:\saixt\server\data\saixt.db'
con = sqlite3.connect(DB)
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
print('表:', [r[0] for r in cur.fetchall()])
try:
    cur.execute('SELECT COUNT(*) FROM questions')
    print('题量:', cur.fetchone()[0])
    cur.execute('SELECT subject, COUNT(*) FROM questions GROUP BY subject ORDER BY COUNT(*) DESC')
    print('\n-- 各科目题量 --')
    for s, c in cur.fetchall():
        print(f'  {c:6}  {s}')
    # 章节分布（每周目 Top 章节）
    cur.execute('''SELECT subject, chapter, COUNT(*) c FROM questions
                   GROUP BY subject, chapter ORDER BY subject, c DESC''')
    from collections import defaultdict
    subj_ch = defaultdict(int)
    for s, ch, c in cur.fetchall():
        subj_ch[s] += 1
    print('\n-- 各科目章节数 --')
    for s, n in sorted(subj_ch.items(), key=lambda x: -x[1]):
        print(f'  {n:4}  {s}')
except Exception as e:
    print('questions 查询失败:', e)
con.close()
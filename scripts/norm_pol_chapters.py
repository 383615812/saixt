# -*- coding: utf-8 -*-
"""政治章节名归一化：4大主题的变体章节合并到主干章节"""
import sqlite3

DB = r'E:\saixt\server\data\saixt.db'

# 映射：旧章节名 -> 主干章节（按现有主干/<主题的最小编号>统一）
MAPPING = {
    # 中国特色社会主义 -> 专题01
    '专题01 《中国特色社会主义》【精选高频考题100题】（选择题）': '专题01《中国特色社会主义》',
    '专题02 《中国特色社会主义》【精选高频考题30题】（主观题）': '专题01《中国特色社会主义》',
    # 经济与社会 -> 专题03
    '专题03 《经济与社会》【精选高频考题100题】（选择题）': '专题03《经济与社会》',
    '专题04 《经济与社会》【精选高频考题30题】（主观题ABC卷）': '专题03《经济与社会》',
    '专题02 《经济与社会》': '专题03《经济与社会》',
    # 政治与法治 -> 专题05
    '专题05政治与法治【精选高频考题100题】（选择题）': '专题05《政治与法治》',
    '专题06 《政治与法治》【精选高频考题30题】（主观题ABC卷）': '专题05《政治与法治》',
    '专题03《政治与法治》': '专题05《政治与法治》',
    # 哲学与文化 -> 专题07
    '专题07 《哲学与文化》【精选高频考题100题】（选择题）': '专题07《哲学与文化》',
    '专题08 《哲学与文化》【精选高频考题30题】（主观题ABC卷）': '专题07《哲学与文化》',
    '专题04《哲学与文化》': '专题07《哲学与文化》',
}

con = sqlite3.connect(DB)
cur = con.cursor()
con.execute('BEGIN IMMEDIATE')

# 仅更新存在的章节名（防止张冠李戴）
for old, new in MAPPING.items():
    exists = cur.execute("SELECT COUNT(*) FROM questions WHERE subject='政治' AND chapter=?", (old,)).fetchone()[0]
    if exists:
        cur.execute("UPDATE questions SET chapter=? WHERE subject='政治' AND chapter=?", (new, old))
        print(f'合并 [{old}] -> [{new}] ({exists}题)')
    else:
        print(f'跳过(不存在) [{old}]')

con.commit()

print('\n===== 归一化后政治章节 =====')
for r in cur.execute("SELECT chapter, COUNT(*) FROM questions WHERE subject='政治' GROUP BY chapter ORDER BY COUNT(*) DESC").fetchall():
    print(f'{r[1]:>4}  [{r[0]}]')
con.close()
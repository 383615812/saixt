import sqlite3
conn = sqlite3.connect(r'E:\saixt\server\data\saixt.db')
cur = conn.cursor()

print('=== 当前题库统计 ===')
cur.execute("SELECT subject, chapter, COUNT(*) FROM questions GROUP BY subject, chapter ORDER BY subject, chapter")
for r in cur.fetchall():
    print(f'  {r[0]} | {r[1]} | {r[2]}题')

print('\n=== 来源统计 ===')
cur.execute("SELECT source, COUNT(*) FROM questions GROUP BY source ORDER BY COUNT(*) DESC LIMIT 20")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}题')

print('\n=== 各科目总数 ===')
cur.execute("SELECT subject, COUNT(*) FROM questions GROUP BY subject ORDER BY COUNT(*) DESC")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}题')

conn.close()

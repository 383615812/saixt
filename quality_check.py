import sqlite3, json
conn = sqlite3.connect(r'E:\saixt\server\data\saixt.db')
cur = conn.cursor()

print('=== 题库总体统计 ===')
cur.execute("SELECT COUNT(*) FROM questions")
print(f'总题数: {cur.fetchone()[0]}')

print('\n=== 各科目统计 ===')
cur.execute("SELECT subject, COUNT(*) FROM questions GROUP BY subject ORDER BY COUNT(*) DESC")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}题')

print('\n=== 题型分布 ===')
cur.execute("SELECT type, COUNT(*) FROM questions GROUP BY type")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}题')

print('\n=== 质量检查 ===')
# 缺答案
cur.execute("SELECT COUNT(*) FROM questions WHERE answer IS NULL OR answer = '' OR answer = '未提供'")
print(f'缺答案: {cur.fetchone()[0]}题')
# 缺解析
cur.execute("SELECT COUNT(*) FROM questions WHERE analysis IS NULL OR analysis = ''")
print(f'缺解析: {cur.fetchone()[0]}题')
# 缺题干
cur.execute("SELECT COUNT(*) FROM questions WHERE stem IS NULL OR stem = '' OR length(stem) < 5")
print(f'缺题干(含过短): {cur.fetchone()[0]}题')
# 单选项
cur.execute("SELECT id, subject, stem, options FROM questions WHERE type != 'subjective'")
bad_single = []
for row in cur.fetchall():
    try:
        opts = json.loads(row[3]) if row[3] else []
        if 0 < len(opts) < 2:
            bad_single.append(row[0])
    except:
        pass
print(f'单选项(客观题): {len(bad_single)}题')

# 空选项
cur.execute("SELECT id, options FROM questions WHERE type != 'subjective'")
empty_opt = 0
for row in cur.fetchall():
    try:
        opts = json.loads(row[1]) if row[1] else []
        for o in opts:
            if not o[1].strip():
                empty_opt += 1
                break
    except:
        pass
print(f'空选项: {empty_opt}题')

print('\n=== 来源分布(前10) ===')
cur.execute("SELECT source, COUNT(*) FROM questions GROUP BY source ORDER BY COUNT(*) DESC LIMIT 10")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}题')

print('\n=== 章节数 ===')
cur.execute("SELECT COUNT(DISTINCT chapter) FROM questions")
print(f'总章节数: {cur.fetchone()[0]}')

conn.close()

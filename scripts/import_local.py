# -*- coding: utf-8 -*-
"""本地增量导入：从 JSON 导入题库行（完整题干去重）"""
import sqlite3, re, json, sys

LOCAL = r'E:\saixt\server\data\saixt.db'
JSON_PATH = sys.argv[1] if len(sys.argv) > 1 else r'E:\saixt\scripts\sync_prod_to_local.json'

def norm(s):
    return re.sub(r'\s+', '', s or '')

data = json.load(open(JSON_PATH, encoding='utf-8'))
con = sqlite3.connect(LOCAL)
cur = con.cursor()

existing = set()
for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
    existing.add((subj, norm(stem)))
print('本地现有唯一题:', len(existing))

inserted = skipped = 0
for r in data['rows']:
    key = (r['subject'], norm(r['stem']))
    if key in existing:
        skipped += 1
        continue
    existing.add(key)
    cur.execute(
        'INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)',
        (r['subject'], r['chapter'], r['type'], r['difficulty'], r['stem'], r['options'], r['answer'], r['analysis'], r['source'])
    )
    inserted += 1

con.commit()
total = cur.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
print(f'插入: {inserted}, 跳过(已存在): {skipped}')
print(f'本地题库总数: {total}')
con.close()

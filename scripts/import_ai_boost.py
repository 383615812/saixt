# -*- coding: utf-8 -*-
"""导入 AI 生成的通用技术 + 信息技术补强题到本地题库。
   章节名归一化到库中已有章节名。"""
import json, re, sqlite3, collections

DB = r'E:\saixt\server\data\saixt.db'

# 通用技术章节名：生成名 -> 库中名
TY_MAP = {
    '技术的性质与作用': '技术的性质与作用',
    '设计的过程与评价': '设计的过程与评价',
    '设计图样与方案构思': '设计图样与方案构思',
    '制作原型及模型': '制作原型及模型',
    '结构与设计': '结构设计',
    '流程与设计': '流程设计',
    '系统与设计': '系统设计',
    '控制与设计': '控制设计',
}

def norm(s):
    return re.sub(r'\s+', '', s or '')

def load_existing(con):
    d = collections.defaultdict(set)
    for subj, stem in con.execute('SELECT subject, stem FROM questions'):
        d[subj].add(norm(stem))
    return d

def import_json(con, path, subject, chapter_map, existing):
    qs = json.load(open(path, encoding='utf-8'))
    seen = set()
    by_ch = collections.Counter()
    total = 0
    SQL = ("INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) "
           "VALUES (?,?,?,?,?,?,?,?,?)")
    for q in qs:
        ch = chapter_map.get(q['chapter'], q['chapter'])
        key = (subject, norm(q['stem']))
        if key in existing[subject] or key in seen:
            continue
        seen.add(key)
        con.execute(SQL, (subject, ch, 'single', 2, q['stem'],
                          json.dumps(q['options'], ensure_ascii=False),
                          q['answer'].upper(), q['analysis'] or '', 'AI生成补强'))
        by_ch[ch] += 1
        total += 1
    print(f'[{subject}] 新增 {total} 题')
    for c, n in by_ch.most_common():
        print(f'  {n:4}  {c}')
    return total

con = sqlite3.connect(DB)
con.execute('PRAGMA busy_timeout=8000')
cur = con.cursor()
existing = load_existing(con)

con.execute('BEGIN IMMEDIATE')
try:
    t1 = import_json(con, r'E:\saixt\server\data\generated_ty_questions.json', '通用技术', TY_MAP, existing)
    # 重新加载 existing（含刚导入的，避免跨科目干扰，实际无影响）
    t2 = import_json(con, r'E:\saixt\server\data\generated_xi_questions.json', '信息技术', {}, existing)
    con.commit()
except Exception as e:
    con.rollback()
    raise e

total = cur.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
for s in ('通用技术', '信息技术'):
    c = cur.execute('SELECT COUNT(*) FROM questions WHERE subject=?', (s,)).fetchone()[0]
    print(f'\n{s} 题数: {c}')
print('\n本地题库总数:', total)
con.close()
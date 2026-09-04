# -*- coding: utf-8 -*-
"""运行库迁移：plans 加 lang/oral 列并回填、补入 65A1 院校及 10 专业（纯增量）。"""
import sqlite3, openpyxl, json, os

DB = r'E:\saixt\server\data\saixt.db'
XLSX = r'E:\saixt\云南2026春季高考招生计划普通类批次.xlsx'

con = sqlite3.connect(DB, timeout=30)
cur = con.cursor()

# 1) 加列（幂等）
for col, ddl in [('lang', "ALTER TABLE plans ADD COLUMN lang TEXT DEFAULT '不限'"),
                 ('oral', "ALTER TABLE plans ADD COLUMN oral TEXT DEFAULT '否'")]:
    cols = [r[1] for r in cur.execute('PRAGMA table_info(plans)')]
    if col not in cols:
        cur.execute(ddl)
        print('已加列:', col)

# 2) xlsx 映射 (school_code, major_code) -> {lang, oral, tuition, plan}
wb = openpyxl.load_workbook(XLSX, read_only=True)
ws = wb['Sheet1']
xmap = {}
xa1 = []  # (code,name,mcode,mname,tuition,plan,lang,oral)
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i < 2 or row[0] is None:
        continue
    code, name, mcode, mname, batch, cls, tuit, plan, lang, oral = row[:10]
    c = str(code).strip()
    if not c or mcode is None:
        continue
    d = {'lang': str(lang or '').strip() or '不限',
         'oral': str(oral or '').strip() or '否',
         'tuition': str(tuit or '').strip(),
         'plan': int(plan) if plan not in (None, '') else 0}
    if c == '65A1':
        xa1.append((c, name, int(mcode), mname, d))
    else:
        xmap[(c, int(mcode))] = d

# 3) 回填已存在专业的 lang/oral（及学费待定补全）
upd = con.executemany(
    'UPDATE plans SET lang=?, oral=? WHERE school_code=? AND major_code=?',
    [(d['lang'], d['oral'], c, mc) for (c, mc), d in xmap.items()])
print('已回填语种/口试:', upd.rowcount, '条')

# 4) 学费「待定」若 xlsx 有具体值则补全
fix = con.executemany(
    "UPDATE plans SET tuition=? WHERE school_code=? AND major_code=? AND tuition='待定'",
    [(d['tuition'], c, mc) for (c, mc), d in xmap.items() if d['tuition'] and d['tuition'] != '待定'])
print('补全待定学费:', fix.rowcount, '条')

# 5) 插入 65A1 院校（若不存在）
exists = cur.execute("SELECT COUNT(*) FROM schools WHERE code='65A1'").fetchone()[0]
if not exists:
    name = xa1[0][1]
    total_plans = sum(d['plan'] for *_, d in xa1)
    tuis = sorted({d['tuition'] for *_, d in xa1 if d['tuition'] and d['tuition'] != '待定'})
    tr = '-'.join(tuis[:2]) if len(tuis) > 1 else (tuis[0] if tuis else '待定')
    cur.execute('INSERT INTO schools (code,name,plans,majors,tuition_range) VALUES (?,?,?,?,?)',
                ('65A1', name, total_plans, len(xa1), tr))
    print('已插入院校 65A1:', name, '计划', total_plans, '专业', len(xa1))
else:
    print('65A1 院校已存在，跳过')

# 6) 插入 65A1 的 10 个专业（若不存在）
for c, nm, mc, mn, d in xa1:
    have = cur.execute('SELECT COUNT(*) FROM plans WHERE school_code=? AND major_code=?', (c, mc)).fetchone()[0]
    if not have:
        cur.execute('INSERT INTO plans (school_code,school_name,major_code,major_name,tuition,plan,lang,oral) VALUES (?,?,?,?,?,?,?,?)',
                    (c, nm, mc, mn, d['tuition'], d['plan'], d['lang'], d['oral']))
        print('  插入专业:', mn, d['tuition'], d['plan'], d['lang'], d['oral'])

con.commit()
print('\n迁移完成。plans总数:', cur.execute('SELECT COUNT(*) FROM plans').fetchone()[0],
      '| schools总数:', cur.execute('SELECT COUNT(*) FROM schools').fetchone()[0],
      '| 65A1:',
      cur.execute("SELECT schools.code,schools.name,schools.plans,schools.majors FROM schools WHERE code='65A1'").fetchone(),
      '| plans含65A1:', cur.execute("SELECT COUNT(*) FROM plans WHERE school_code='65A1'").fetchone()[0])
con.close()
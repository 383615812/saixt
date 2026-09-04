# -*- coding: utf-8 -*-
"""生成规范种子 schools.json / plans.json：
以运行库(saixt.db)为基础(不丢5357等其它批次院校)，合并 xlsx 中缺失的 65A1 院校，
并为全部专业补上 外语语种(lang)/是否口试(oral) 权威字段。
"""
import sqlite3, openpyxl, json, collections, re

DB = r'E:\saixt\server\data\saixt.db'
XLSX = r'E:\saixt\云南2026春季高考招生计划普通类批次.xlsx'
OUT_DIR = r'E:\saixt\server\data'

# ---- 1. 运行库现有 schools / plans ----
con = sqlite3.connect(DB)
cur = con.cursor()
dbschools = cur.execute('SELECT code,name,plans,majors,tuition_range FROM schools').fetchall()
dbplans = cur.execute(
    'SELECT school_code,school_name,major_code,major_name,tuition,plan FROM plans').fetchall()
con.close()

schools = {}
for code, name, plans, majors, tr in dbschools:
    schools[code] = {
        'code': code, 'name': name,
        'plans': int(plans or 0), 'majors': int(majors or 0),
        'tuition_range': tr or '',
    }

plans = []  # each: {school_code,school_name,major_code,major_name,tuition,plan,lang,oral}
for sc, sn, mc, mn, tu, pl in dbplans:
    plans.append({
        'school_code': sc, 'school_name': sn, 'major_code': mc, 'major_name': mn,
        'tuition': str(tu or ''), 'plan': int(pl or 0), 'lang': '不限', 'oral': '否',
    })

# ---- 2. xlsx 权威数据(语种/口试/学费/计划) ----
wb = openpyxl.load_workbook(XLSX, read_only=True)
ws = wb['Sheet1']
xmap = {}  # (school_code, major_code) -> dict
xa1 = []   # 65A1 专业
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i < 2 or row[0] is None:
        continue
    code, name, mcode, mname, batch, cls, tuit, plan, lang, oral = row[:10]
    c = str(code).strip()
    if not c:
        continue
    d = {
        'tuition': str(tuit or '').strip(), 'plan': int(plan) if plan not in (None, '') else 0,
        'lang': str(lang or '').strip() or '不限', 'oral': str(oral or '').strip() or '否',
    }
    if c == '65A1':
        xa1.append((c, name, mcode, mname, d))
    else:
        xmap[(c, mcode)] = (name, d)

# ---- 3. 为已有专业回填 lang/oral（学费/计划保持一致，可顺带校正） ----
for p in plans:
    k = (p['school_code'], int(p['major_code']))
    if k in xmap:
        xname, d = xmap[k]
        p['lang'] = d['lang']
        p['oral'] = d['oral']
        # 学费「待定」仅当 xlsx 也待定才保留，否则补齐；计划数以 xlsx 权威为准
        if d['tuition']:
            p['tuition'] = d['tuition']
        p['plan'] = d['plan']

# ---- 4. 追加 65A1 新疆生产建设兵团兴新职业技术学院 ----
for c, name, mcode, mname, d in xa1:
    plans.append({
        'school_code': c, 'school_name': name, 'major_code': mcode, 'major_name': mname,
        'tuition': d['tuition'], 'plan': d['plan'], 'lang': d['lang'], 'oral': d['oral'],
    })
# 65A1 院校聚合
a1_plans = [p for p in xa1]
schools['65A1'] = {
    'code': '65A1', 'name': '新疆生产建设兵团兴新职业技术学院',
    'plans': sum(d['plan'] for _, _, _, _, d in a1_plans),
    'majors': len(a1_plans),
    'tuition_range': '待定'  # xlsx未给学费时兜底
}
tuis = sorted({d['tuition'] for _, _, _, _, d in a1_plans if d['tuition'] and d['tuition'] != '待定'})
if tuis:
    schools['65A1']['tuition_range'] = '-'.join(tuis[:2]) if len(tuis) > 1 else tuis[0]

# ---- 5. 按代码排序输出 ----
schools_sorted = [schools[c] for c in sorted(schools)]
plans_sorted = sorted(plans, key=lambda p: (str(p['school_code'])[0].isdigit() == False, p['school_code'], int(p['major_code'])))

with open(OUT_DIR + r'\plans.json', 'w', encoding='utf-8') as f:
    json.dump(plans_sorted, f, ensure_ascii=False, indent=1)
with open(OUT_DIR + r'\schools.json', 'w', encoding='utf-8') as f:
    json.dump(schools_sorted, f, ensure_ascii=False, indent=1)

print('schools.json:', len(schools_sorted), '所')
print('plans.json:', len(plans_sorted), '条')
print('含65A1:', '65A1' in schools)
print('\n65A1 详情:')
for p in [pp for pp in plans if pp['school_code'] == '65A1']:
    print('  ', p['major_code'], p['major_name'], p['tuition'], p['plan'], p['lang'], p['oral'])
# 语种/口试分布
print('\nlang分布:', dict(collections.Counter(p['lang'] for p in plans)))
print('oral分布:', dict(collections.Counter(p['oral'] for p in plans)))
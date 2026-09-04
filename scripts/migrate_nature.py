# -*- coding: utf-8 -*-
"""院校模块规范化：
① schools 增加 nature(公办/民办)、flagship(王牌专业) 列
② 按权威「入学分」xlsx(代码优先/名称模糊兜底)填写 nature 与 flagship
③ 剥离校名中的 (民办) 前缀，同步 plans.school_name
"""
import openpyxl, sqlite3, re, difflib, json

DB = r'E:\saixt\server\data\saixt.db'
X = r'E:\saixt\云南春季高考招生院校入学分.xlsx'

def norm(n):
    if n is None:
        return ''
    s = str(n)
    s = re.sub(r'\s+', '', s)
    s = s.replace('（', '(').replace('）', ')')
    s = s.replace('(民办)', '')
    return s

def clean_flagship(raw):
    """从带代码/括注的原始王牌专业串提取干净专业名（≤4个，去重）。"""
    if not raw:
        return []
    s = str(raw)
    s = s.replace('（', '(').replace('）', ')')
    # 去掉已知背景性括注段(整体)
    s = re.sub(r'\([^()]*(参考专业|国控专业|新办|不好|太贵|学费|身高|色盲|形象|自己组建|只针对|校本部|部分)[^()]*\)', '', s)
    tokens = re.split(r'[\n、,，;；/丨|]', s)
    out = []
    seen = set()
    for tk in tokens:
        t = tk.strip()
        if not t:
            continue
        # 去掉前导年份/括号残留
        t = re.sub(r'^\(?20\d\d\)?', '', t).strip()
        # 去掉尾部编号(如 500210 / （500210）)
        t = re.sub(r'(?:\d+)*\s*\(?\d{5,6}\)?\s*$', '', t).strip()
        # 若仍含括号注释则仅保留括号前主干
        m = re.search(r'^([\u4e00-\u9fa5A-Za-z、 ]+?)\(', t)
        if m and m.group(1):
            t = m.group(1).strip()
        # 去掉残留编号
        t = re.sub(r'\d+', '', t).strip('：:；;-—., ')
        # 仅保留像专业名的(≥2个中文字符，含"专业"/技术/管理/制造/护理/教育等特征可选)
        if len(re.sub(r'[\u4e00-\u9fa5]', '', t)) > 0 and len(t) < 2:
            continue
        if len([c for c in t if '\u4e00' <= c <= '\u9fa5']) < 2:
            continue
        if t in seen or t in ('院级', '专业'):
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= 4:
            break
    return out

# ---------- 数据源解析 ----------
wb = openpyxl.load_workbook(X, read_only=True)
codeMap = {}   # code -> {nature, flagship(list)}
nameMap = {}   # norm(name) -> {nature, flagship(list)}
for ws in wb.worksheets:
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        if ws.title == '春季高考院校':
            code, name, nature, prof = map(lambda x: (row[x] if len(row) > x else None), [1, 2, 3, 4]) if False else (row[1] if len(row) > 1 else None, row[2] if len(row) > 2 else None, row[3] if len(row) > 3 else None, row[4] if len(row) > 4 else None)
        else:
            name, nature, prof = row[1] if len(row) > 1 else None, row[2] if len(row) > 2 else None, row[3] if len(row) > 3 else None
            code = None
        if not name:
            continue
        na = None
        if nature:
            na_raw = str(nature).replace(chr(10), '')
            na = '民办' if '民办' in na_raw else ('公办' if '公办' in na_raw else None)
        fl = clean_flagship(prof)
        nm = norm(name)
        if code and str(code).strip().isdigit() or (code and str(code).strip() == '65A1'):
            codeMap[str(code).strip()] = {'nature': na, 'flagship': fl}
        else:
            nameMap[nm] = {'nature': na, 'flagship': fl}

# ---------- 应用到库 ----------
con = sqlite3.connect(DB); c = con.cursor()
# 加列
for col, ddl in [('nature', 'ALTER TABLE schools ADD COLUMN nature TEXT'),
                 ('flagship', 'ALTER TABLE schools ADD COLUMN flagship TEXT')]:
    cols = [r[1] for r in c.execute('PRAGMA table_info(schools)')]
    if col not in cols:
        c.execute(ddl)
        print('已加列:', col)

schools = c.execute('SELECT code,name FROM schools').fetchall()
files = []
for code, name in schools:
    orig = name
    info = codeMap.get(str(code)) if str(code) in codeMap else None
    # 名称兜底(含别名：去注释后包含/被包含)
    if not info or (not info['nature'] and not info['flagship']):
        base = norm(name)
        keys = list(nameMap)
        cand = None
        if base in nameMap:
            cand = nameMap[base]
        else:
            mm = difflib.get_close_matches(base, keys, n=1, cutoff=0.72)
            cand = nameMap[mm[0]] if mm else None
        if not info:
            info = cand
        else:
            if not info['nature'] and cand:
                info['nature'] = info['nature'] or cand.get('nature')
            if not info['flagship'] and cand:
                info['flagship'] = info['flagship'] or cand.get('flagship')
    # 兜底性质：校名含"民办"
    nature = info['nature'] if info and info['nature'] else ('民办' if '民办' in name else '公办')
    flagship = (info['flagship'] if info else None) or []
    # 剥离 (民办) 前缀
    clean = re.sub(r'^[\(（]民办[\)）]', '', name).strip().replace('（', '(').replace('）', ')')
    c.execute('UPDATE schools SET name=?, nature=?, flagship=? WHERE code=?',
              (clean, nature, ', '.join(flagship), code))
    files.append((code, orig, clean, nature, flagship))

# 同步 plans.school_name 及 target 快照无关(自由文本)
c.execute('''UPDATE plans SET school_name = (SELECT s.name FROM schools s WHERE s.code = plans.school_code)
             WHERE EXISTS (SELECT 1 FROM schools s WHERE s.code = plans.school_code)''')

con.commit()
print('共规范化 %d 所院校，其中改名校名:' % len(files))
cnt = 0
for code, orig, clean, nature, fl in files:
    if orig != clean or nature not in ('公办',) or fl:
        cnt += 1
        print('  %s | %s -> %s | %s | 王牌=%s' % (code, orig, clean, nature, '、'.join(fl) if fl else ''))
print('\n(共显示 %d 条变化/含丰富信息)' % cnt)
print('plans.school_name 已按 schools.name 同步。')
con.close()
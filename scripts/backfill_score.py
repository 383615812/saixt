# -*- coding: utf-8 -*-
"""用入学分xlsx为运行库缺口院校补齐 estimate_score（仅填空，不覆盖）。
'春季高考院校' 表为主线(有代码)，'Sheet1' 入学分作补充；名称做去注释/白发/变体模糊匹配。
"""
import openpyxl, sqlite3, re, difflib

CON = r'E:\saixt\server\data\saixt.db'
X = r'E:\saixt\云南春季高考招生院校入学分.xlsx'

def norm(n):
    if n is None:
        return ''
    s = str(n)
    s = re.sub(r'\s+', '', s)
    s = s.replace('（', '(').replace('）', ')')
    s = s.replace('(民办)', '')
    # 去掉身份无害的装饰性括注（可能含原校名/学费/新办等），但要保留 '(原X)' 主体信息由模糊匹配兜底
    return s

def strip_quals(n):
    # 去掉形如 '(部分专业学费低)''(新办，可以去)''(不好)''(安宁校区)' 的质量/标注括注
    return re.sub(r'\([^()]*(学费|新办|可以|不好|校区|专业)[^()]*\)', '', norm(n))

wb = openpyxl.load_workbook(X, read_only=True)
src = {}      # norm(name) -> score
src_qualified = {}  # strip_quals(name) -> score
for ws in wb.worksheets:
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        if ws.title == '春季高考院校':
            name, score = row[1], row[7] if len(row) > 7 else None
        else:
            name, score = row[1], row[5] if len(row) > 5 else None
        if not name or not score:
            continue
        sco = str(score).strip()
        if sco in ('预估分数', '入学分', ''):
            continue
        nm, nmq = norm(name), strip_quals(name)
        src[nm] = sco
        if nmq:
            src_qualified[nmq] = sco

all_names = list(src) + list(src_qualified)

def lookup(dbname):
    base = norm(dbname)
    for k, v in src.items():
        if base == k or base == strip_quals(k):
            return v
    if base in src_qualified:
        return src_qualified[base]
    for pool in (src, src_qualified):
        cand = difflib.get_close_matches(base, list(pool), n=3, cutoff=0.62)
        for pc in cand:
            return pool[pc]
    return None

con = sqlite3.connect(CON); c = con.cursor()
miss = c.execute("SELECT code,name FROM schools WHERE estimate_score IS NULL OR trim(estimate_score)=''").fetchall()
print('当前缺失 estimate_score 院校:', len(miss))
applied = []
for code, dbname in miss:
    sco = lookup(dbname)
    if sco:
        c.execute("UPDATE schools SET estimate_score=? WHERE code=? AND (estimate_score IS NULL OR trim(estimate_score)='')", (sco, code))
        if c.rowcount:
            applied.append((code, dbname, sco))
con.commit()
print('\n已补齐 %d 所:' % len(applied))
for a in applied:
    print('  ', a[0], a[1], '->', a[2])
con.close()
print('\n操作要点：仅填空，未覆盖已有46所的任一既有值。')
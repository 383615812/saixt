# -*- coding: utf-8 -*-
"""导入 2026 招生计划 + 入学预估分，完善院校资料库（幂等，可重跑）."""
import re, shutil, sqlite3, sys
import pandas as pd

DB = r"E:\saixt\server\data\saixt.db"
PLAN_XLSX = r"E:\saixt\云南2026春季高考招生计划普通类批次.xlsx"
EST_XLSX = r"E:\saixt\云南春季高考招生院校入学分.xlsx"

# ---------- 解析 招生计划 ----------
raw = pd.read_excel(PLAN_XLSX, engine="openpyxl", header=None, dtype=str, keep_default_na=False)
hdr = next(i for i in range(raw.shape[0]) if any("院校代号"==str(x).strip() for x in raw.iloc[i]))
df = raw.iloc[hdr+1:].copy()
headers = [str(x).replace("\n","").strip() for x in raw.iloc[hdr]]
df.columns = headers

def s(x): return str(x).strip().replace("\xa0","") if pd.notna(x) else ""

plan_rows = []
for _, r in df.iterrows():
    code = s(r.get("院校代号","")); name = s(r.get("院校名称",""))
    major_code = s(r.get("专业代号","")); major_name = s(r.get("专业名称",""))
    if not code.isdigit() or not name or not major_name:   # 滤掉分页页脚脏行
        continue
    plan_str = s(r.get("招生计划数",""))
    plan_rows.append({
        "code": code, "name": name, "major_code": major_code,
        "major_name": major_name, "tuition": s(r.get("学费","")), "plan": plan_str
    })
print(f"[招生计划] 有效专业行 {len(plan_rows)}，覆盖院校 {len({p['code'] for p in plan_rows})} 所")

# ---------- 解析 入学预估分 ----------
est = {}
attr = {}
es = pd.read_excel(EST_XLSX, sheet_name="春季高考院校", engine="openpyxl", dtype=str, keep_default_na=False)
for _, r in es.iterrows():
    code = s(r.get("学校代码",""))
    if not code.isdigit(): continue
    score = s(r.get("预估分数","")); nature = s(r.get("院校性质",""))
    est[code] = score
    if nature: attr[code] = nature
print(f"[入学预估分] 有效院校 {len(est)} 所")

# ---------- 学费解析与区间格式化 ----------
def tuition_yuan(raw):
    if not raw or "待定" in raw: return None
    m = re.findall(r"(\d+(?:\.\d+)?)\s*万?元", raw)
    if not m: return None
    vals = []
    for n in re.findall(r"(\d+(?:\.\d+)?)(万元|元)", raw):
        v, unit = n
        vals.append(float(v) * 10000 if unit == "万元" else float(v))
    return min(vals) if vals else None

def fmt_range(vals):
    vals = [v for v in vals if v is not None]
    if not vals: return "待定"
    lo, hi = min(vals), max(vals)
    f = lambda n: f"{n/10000:g}万" if n >= 10000 else f"{int(n)}元"
    return f(lo) if int(lo) == int(hi) else f"{f(lo)}-{f(hi)}"

# ---------- 写库 ----------
shutil.copy(DB, DB + ".bak-before-schools2026")
conn = sqlite3.connect(DB)
cur = conn.cursor()
try:
    cur.execute("ALTER TABLE schools ADD COLUMN estimate_score TEXT")
    conn.commit()
except sqlite3.OperationalError:
    pass  # 列已存在

# 已有院校（保留原名，含 (民办) 前缀）
old = {r[0]: r[1] for r in cur.execute("SELECT code,name FROM schools").fetchall()}

# 1) 重建受覆盖学校的 plans
covered = set()
cur.execute("BEGIN")
for code in {p["code"] for p in plan_rows}:
    covered.add(code)
    cur.execute("DELETE FROM plans WHERE school_code=?", (code,))
    name = old.get(code) or plan_rows[0]["name"]
    for p in [p for p in plan_rows if p["code"] == code]:
        major_code = int(p["major_code"]) if p["major_code"].isdigit() else p["major_code"]
        plan_n = int(p["plan"]) if p["plan"].isdigit() else 0
        cur.execute(
            "INSERT INTO plans (school_code, school_name, major_code, major_name, tuition, plan) VALUES (?,?,?,?,?,?)",
            (code, name, major_code, p["major_name"], p["tuition"] or None, plan_n),
        )
# 计算聚合
agg = {code: {"plans": 0, "majors": 0, "tfs": [], "name": old.get(code) or ""} for code in covered}
for p in plan_rows:
    a = agg[p["code"]]
    a["name"] = old.get(p["code"]) or p["name"]
    a["plans"] += int(p["plan"]) if p["plan"].isdigit() else 0
    a["majors"] += 1
    y = tuition_yuan(p["tuition"]); a["tfs"].append(y)
for code, a in agg.items():
    a["tuition_range"] = fmt_range(a["tfs"])
    a["majors"] = cur.execute("SELECT COUNT(DISTINCT major_code) FROM plans WHERE school_code=?", (code,)).fetchone()[0]

# 2) upsert schools（含新增外省院校）
for code in covered | set(est) | set(attr):
    a = agg.get(code, {"plans": 0, "majors": 0, "tfs": [], "tuition_range": "待定", "name": ""})
    name = old.get(code)
    if name is None:
        nm = a["name"]
        if not nm and code in est:
            nm = next((s(r.get("院校名称","")) for _, r in es.iterrows() if s(r.get("学校代码",""))==code), code)
        nature = attr.get(code, "")
        if nature == "民办" and not nm.startswith("(民办)"):
            nm = "(民办)" + nm
        name = nm
    cur.execute("INSERT OR IGNORE INTO schools (code, name) VALUES (?,?)", (code, name))
    cur.execute(
        "UPDATE schools SET name=?, plans=?, majors=?, tuition_range=?, estimate_score=? WHERE code=?",
        (name, a["plans"], a["majors"], a["tuition_range"], est.get(code), code),
    )
conn.commit()

# 3) 汇总
print(f"[写库] schools={cur.execute('SELECT COUNT(*) FROM schools').fetchone()[0]} 所, plans={cur.execute('SELECT COUNT(*) FROM plans').fetchone()[0]} 条")
print("[预估分] 已写入:", sum(1 for c in est if cur.execute('SELECT estimate_score FROM schools WHERE code=?',(c,)).fetchone()))
print("\n样例（新增/更新）：")
for r in cur.execute("SELECT code,name,plans,majors,tuition_range,estimate_score FROM schools WHERE code IN ('5374','5025','5326','5360') ORDER BY code").fetchall():
    print(" ", r)
conn.close()
print("\n完成。数据库已备份为 saixt.db.bak-before-schools2026")
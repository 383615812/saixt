# -*- coding: utf-8 -*-
"""解析云南2026春季高考招生计划文本 -> schools.json / plans.json"""
import re, glob, os, json

BASE = r"C:\Users\hp\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a8d462bbfba1b4159f070e2\调研资料\extracted"
OUT = r"E:\saixt\server\data"

schools = {}   # code -> school
plans = []     # list of plan rows

# 行格式: 院校代号+院校名称 专业代号+专业名称 学费 计划数
# 例: 5025重庆城市管理职业学院 1现代物业管理 待定 3
pat = re.compile(r"^(\d{4})(\S+?)\s+(\d+)(\S+?)\s+(\S+?)\s+(\d+)$")

for f in sorted(glob.glob(os.path.join(BASE, "院校_page_*.txt"))):
    for line in open(f, encoding="utf-8"):
        line = line.strip()
        m = pat.match(line)
        if not m:
            continue
        code, sname, mcode, mname, tuition, plan = m.groups()
        plan = int(plan)
        # 过滤页脚广告行（昆明梦飞教育培训学校等）
        if "梦飞" in sname or "签订协议" in sname:
            continue
        if code not in schools:
            schools[code] = {
                "code": code,
                "name": sname,
                "plans": 0,
                "majors": 0,
                "tuition_range": [tuition, tuition],
            }
        s = schools[code]
        s["plans"] += plan
        s["majors"] += 1
        # 学费区间（万元换算为元，支持小数）
        lo, hi = s["tuition_range"]
        if tuition != "待定":
            try:
                v = float(re.sub(r"[^\d.]", "", tuition))
                if "万" in tuition:
                    v = v * 10000
                v = int(round(v))
                if lo == "待定" or (isinstance(lo, str)):
                    s["tuition_range"] = [v, v]
                else:
                    s["tuition_range"] = [min(lo, v), max(hi, v)]
            except Exception:
                pass
        plans.append({
            "school_code": code,
            "school_name": sname,
            "major_code": int(mcode),
            "major_name": mname,
            "tuition": tuition,
            "plan": plan,
        })

# 排序：按计划数降序
school_list = sorted(schools.values(), key=lambda x: -x["plans"])
for s in school_list:
    tr = s["tuition_range"]
    if isinstance(tr[0], int):
        def fmt(v, use_wan):
            return f"{v/10000:.1f}万" if use_wan else f"{v}元"
        use_wan = tr[1] >= 10000
        s["tuition_range"] = f"{fmt(tr[0], use_wan)}-{fmt(tr[1], use_wan)}" if tr[0] != tr[1] else fmt(tr[0], use_wan)
    else:
        s["tuition_range"] = "待定"

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "schools.json"), "w", encoding="utf-8") as fh:
    json.dump(school_list, fh, ensure_ascii=False, indent=1)
with open(os.path.join(OUT, "plans.json"), "w", encoding="utf-8") as fh:
    json.dump(plans, fh, ensure_ascii=False, indent=1)

print("学校数:", len(school_list))
print("专业数:", sum(s["majors"] for s in school_list))
print("总计划数:", sum(s["plans"] for s in school_list))
print("计划行数:", len(plans))
print("示例:", json.dumps(school_list[0], ensure_ascii=False))

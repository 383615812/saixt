# -*- coding: utf-8 -*-
"""解析真实试卷 -> 原始题库 draft_questions.json（后续人工补充答案与解析）"""
import re, os, json

BASE = r"C:\Users\hp\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a8d462bbfba1b4159f070e2\调研资料"
OUT = r"E:\saixt\server\data"

questions = []

def clean(s):
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def add_q(subject, chapter, qno, stem, options, source, qtype="single"):
    stem = clean(stem)
    opts = [clean(o) for o in options if clean(o)]
    if not stem or not opts:
        return
    questions.append({
        "subject": subject, "type": qtype, "chapter": chapter,
        "stem": stem, "options": opts, "answer": "", "analysis": "",
        "source": source, "qno": qno,
    })

# ---------- 1. 信息周测一（信息技术，4页文本） ----------
it_lines = []
for i in range(1, 5):
    f = os.path.join(BASE, "extracted", f"信息周测一_page_000{i}.txt")
    if os.path.exists(f):
        it_lines += open(f, encoding="utf-8").read().splitlines()

cur = None
for line in it_lines:
    line = line.strip()
    m = re.match(r"^(\d+)[、.．]\s*(.*)$", line)
    if m and not re.match(r"^[A-D]", line):
        if cur and cur["stem"] and cur["options"]:
            add_q("信息技术", "数据与信息", cur["no"], cur["stem"], cur["options"], "信息周测一")
        cur = {"no": int(m.group(1)), "stem": m.group(2), "options": []}
        continue
    om = re.match(r"^([A-D])[.、．]\s*(.*)$", line)
    if om and cur:
        cur["options"].append(om.group(1) + "." + om.group(2))
    elif cur:
        cur["stem"] += line
if cur and cur["stem"] and cur["options"]:
    add_q("信息技术", "数据与信息", cur["no"], cur["stem"], cur["options"], "信息周测一")

# ---------- 2. 通用周测一（通用技术，md） ----------
f = os.path.join(BASE, "试卷", "通用周测一.md")
if os.path.exists(f):
    lines = open(f, encoding="utf-8").read().splitlines()
    cur = None
    for line in lines:
        line = line.strip()
        if line.startswith("!") or line.startswith("media") or line.startswith("width=") or line.startswith("height="):
            continue
        m = re.match(r"^(\d+)[\.、．]\s*(.*)$", line)
        if m and not re.match(r"^[A-D]", line):
            if cur and cur["stem"] and cur["options"]:
                add_q("通用技术", "技术与设计", cur["no"], cur["stem"], cur["options"], "通用技术周测一")
            cur = {"no": int(m.group(1)), "stem": m.group(2), "options": []}
            continue
        om = re.match(r"^([A-D])\s*[.、．]\s*(.*)$", line)
        if om and cur:
            cur["options"].append(om.group(1) + "." + om.group(2))
        elif cur:
            cur["stem"] += line
    if cur and cur["stem"] and cur["options"]:
        add_q("通用技术", "技术与设计", cur["no"], cur["stem"], cur["options"], "通用技术周测一")

# ---------- 3. 周测五（通用技术，md） ----------
f = os.path.join(BASE, "试卷", "周测五.md")
if os.path.exists(f):
    lines = open(f, encoding="utf-8").read().splitlines()
    cur = None
    for line in lines:
        line = line.strip()
        if line.startswith("!") or line.startswith("media") or line.startswith("width=") or line.startswith("height="):
            continue
        m = re.match(r"^(\d+)\\?\.\s*(.*)$", line)
        if m and not re.match(r"^[A-D]", line):
            if cur and cur["stem"] and cur["options"]:
                add_q("通用技术", "技术与设计", cur["no"], cur["stem"], cur["options"], "周测五")
            cur = {"no": int(m.group(1)), "stem": m.group(2), "options": []}
            continue
        om = re.match(r"^([A-D])[.、．]\s*(.*)$", line)
        if om and cur:
            cur["options"].append(om.group(1) + "." + om.group(2))
        elif cur:
            cur["stem"] += line
    if cur and cur["stem"] and cur["options"]:
        add_q("通用技术", "技术与设计", cur["no"], cur["stem"], cur["options"], "周测五")

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "draft_questions.json"), "w", encoding="utf-8") as fh:
    json.dump(questions, fh, ensure_ascii=False, indent=1)

print("题目数:", len(questions))
from collections import Counter
print(Counter(q["subject"] for q in questions))
print("--- 示例 ---")
for q in questions[:3]:
    print(q["subject"], q["qno"], q["stem"][:40])
    for o in q["options"]:
        print("   ", o[:40])

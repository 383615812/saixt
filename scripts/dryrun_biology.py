# -*- coding: utf-8 -*-
"""生物新资料可导入性干跑：不写库，用现有 Parser 解析所有解析版 docx，统计合格题量并抽样"""
import os, re, sys, json
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

BASE = r'E:\saixt'
ROOTS = [
    r'高中生物学业水平考试与学业水平合格考总复习（全国通用）',
    r'【学考复习】2024年高中生物学业水平考试必备考点归纳与测试（新教材专用）',
]
chap_re = re.compile(r'(专题\s*\d+\s*[+]?\s*[^（(【]+|[^（(【]{2,20})')

def chapter_of(path):
    name = os.path.basename(path)
    name = re.sub(r'（解析版）|（原卷版）|（知识梳理）|【学考复习】.*', '', name)
    m = re.match(r'\s*(专题\s*\d+\s*\+?\s*[^（(]+?|[^号]{2,24}?)(?=（|-|【|$)', name)
    if m:
        c = m.group(1).strip().lstrip('+ ').rstrip('+ -')
        return c[:30]
    c = re.sub(r'[-【】].*$', '', name).strip()
    return c[:30] if c else '未命名'

def main():
    files = []
    for r in ROOTS:
        rp = os.path.join(BASE, r)
        if not os.path.isdir(rp):
            print('缺目录', rp); continue
        for p, _, fs in os.walk(rp):
            for f in fs:
                if f.endswith('.docx') and '解析' in f:
                    files.append(os.path.join(p, f))
    print('解析版 docx 数:', len(files))
    import collections
    stat_pass, stat_fail = collections.Counter(), collections.Counter()
    reasons = collections.Counter()
    samples = []
    per_doc = []
    for fp in sorted(files):
        ch = chapter_of(fp)
        try:
            qs = parse_docx(fp, '生物', ch)
        except Exception as e:
            reasons['解析异常:' + str(e)[:40]] += 1
            continue
        ok = [q for q in qs if quality_check(q)]
        stat_pass[ch] += len(ok)
        stat_fail[ch] += len(qs) - len(ok)
        per_doc.append((os.path.basename(fp)[:40], len(qs), len(ok)))
        for q in ok[:2]:
            samples.append((ch, q['stem'][:60], q['answer'][:12], qtype_of(q)))
    print('\n--- 每文档(题数/合格) 抽样前12 ---')
    for name, tot, o in per_doc[:12]:
        print(f'  {o}/{tot}  {name}')
    print('\n--- 章节合格题量 Top15 ---')
    for k, v in stat_pass.most_common(15):
        print(f'  {v:4}  fail={stat_fail.get(k,0):4}  {k}')
    print('\n合格题总量:', sum(stat_pass.values()), ' 不合格:', sum(stat_fail.values()))
    print('异常统计:', dict(reasons))
    print('\n--- 合格题抽样 6 条 ---')
    for ch, st, ans, ty in samples[:6]:
        print(f'  [{ty}] {st} … 答案={ans}')

if __name__ == '__main__':
    main()
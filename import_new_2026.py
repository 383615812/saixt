# -*- coding: utf-8 -*-
"""导入 9/3 新增资料（学考复习考点归纳与测试 / 总复习全国通用 / G27 等）到题库。
   去重逻辑与 dryrun_all_new.py 完全一致：
     1) 质量过滤 (quality_check)
     2) 同科目 规范化题干前50字 与现库去重
     3) 新资料内部同 key 去重（剔除 (1)(2) 重复副本与两批序列互相重叠）
   预期净新增约 9144 题。
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

DB_PATH = r'E:\saixt\server\data\saixt.db'

ROOT_MAP = [
    ('【学考复习】2024年高中化学学业水平考试必备考点归纳与测试（新教材专用）', '化学', '2026考点归纳与测试'),
    ('【学考复习】2024年高中历史学业水平考试必备考点归纳与测试（新教材专用）', '历史', '2026考点归纳与测试'),
    ('【学考复习】2024年高中地理学业水平考试必备考点归纳与测试（新教材专用）', '地理', '2026考点归纳与测试'),
    ('【学考复习】2024年高中政治学业水平考试必备考点归纳与测试（新教材 12份-3102547', '政治', '2026考点归纳与测试'),
    ('【学考复习】2024年高中数学学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）', '数学', '2026考点归纳与测试'),
    ('【学考复习】2024年高中物理学业水平考试必备考点归纳与测试（新教材专用）11份-3116169', '物理', '2026考点归纳与测试'),
    ('【学考复习】2024年高中生物学业水平考试必备考点归纳与测试（新教材专用）', '生物', '2026考点归纳与测试'),
    ('【学考复习】2024年高中英语学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）(20)份', '英语', '2026考点归纳与测试'),
    ('【学考复习】2024年高中语文学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）', '语文', '2026考点归纳与测试'),
    ('（江苏专用）【学考复习】2024年高中数学学业水平考试必备考点归纳与测试', '数学', '2026考点归纳与测试(江苏)'),
    ('高中信息技术学业水平考试与学业水平合格考总复习（全国通用）', '信息技术', '2026总复习'),
    ('高中地理学业水平考试与学业水平合格考总复习（全国通用）', '地理', '2026总复习'),
    ('高中政治学业水平考试与学业水平合格考总复习（全国通用）', '政治', '2026总复习'),
    ('高中数学学业水平考试与学业水平合格考总复习（全国通用）', '数学', '2026总复习'),
    ('高中物理学业水平考试与学业水平合格考总复习（全国通用）', '物理', '2026总复习'),
    ('高中生物学业水平考试与学业水平合格考总复习（全国通用）', '生物', '2026总复习'),
    ('高中英语学业水平考试与学业水平合格考总复习（全国通用）', '英语', '2026总复习'),
    ('高中语文学业水平考试与学业水平合格考总复习（全国通用）', '语文', '2026总复习'),
    ('G27-高中信息技术学考复习（全国通用）', '信息技术', '2026信息技术总复习'),
    ('化学高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子', '化学', '2026知识点复习'),
]

def chapter_of(path):
    name = os.path.basename(path)
    name = re.sub(r'（解析版）|（原卷版）|（知识梳理）|（考点精讲精练精练+实战训练）', '', name)
    m = re.match(r'\s*(专题\s*\d+\s*\+?\s*[^（（【\[]+?|[^号]{2,24}?)(?=（|（|【|\[|-|$)', name)
    if m:
        c = m.group(1).strip().lstrip('+ ').rstrip('+ -')
        return c[:30]
    c = re.sub(r'[-（(【\[]+.*$', '', name).strip()
    return c[:30] if c else '未命名'

def norm(s):
    return re.sub(r'\s+', '', s or '')

def main():
    con = sqlite3.connect(DB_PATH)
    con.execute('PRAGMA busy_timeout=5000')
    con.execute('BEGIN IMMEDIATE')
    cur = con.cursor()

    # 现库题干 load
    existing = collections.defaultdict(set)
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])

    # 收集文件
    jobs = []
    for root, subject, batch in ROOT_MAP:
        rp = os.path.join(BASE, root)
        if not os.path.isdir(rp):
            continue
        for p, _, fs in os.walk(rp):
            for f in fs:
                if f.endswith('.docx') and '解析' in f and '原卷' not in f:
                    jobs.append((os.path.join(p, f), subject, batch))
    print('待解析 解析版 docx:', len(jobs))

    by_subject = collections.defaultdict(int)
    reasons = collections.Counter()
    seen_new = set()
    imported = 0

    for i, (fp, subject, batch) in enumerate(jobs):
        try:
            qs = parse_docx(fp, subject, chapter_of(fp))
        except Exception as e:
            reasons['异常:' + str(e)[:40]] += 1
            continue
        for q in qs:
            if not quality_check(q):
                reasons['质量不过关'] += 1
                continue
            key = norm(q['stem'])[:50]
            if not key or key in existing[subject] or (subject, key) in seen_new:
                continue
            seen_new.add((subject, key))
            qtype = qtype_of(q)
            opts_json = json.dumps(q['options'], ensure_ascii=False)
            source = q.get('source', '') or batch
            cur.execute(
                "INSERT INTO questions (subject, chapter, type, difficulty, stem, options, answer, analysis, source) VALUES (?,?,?,?,?,?,?,?,?)",
                (subject, chapter_of(fp), qtype, 2, q['stem'], opts_json, q['answer'], q['analysis'], source)
            )
            by_subject[subject] += 1
            imported += 1
        if (i + 1) % 50 == 0:
            print(f'  进度 {i+1}/{len(jobs)} 已导入 {imported}')

    con.commit()
    cur.execute('SELECT COUNT(*) FROM questions')
    final = cur.fetchone()[0]
    con.close()

    print('\n===== 导入汇总 =====')
    for s in sorted(by_subject, key=lambda x: -by_subject[x]):
        print(f'  {by_subject[s]:5}  {s}')
    print(f'本次净新增: {imported}')
    print(f'题库总数: {final}')


if __name__ == '__main__':
    main()
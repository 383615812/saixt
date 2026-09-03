# -*- coding: utf-8 -*-
"""全量新资料可导入性评估（不写库）：
   1) 扫描所有 9/3 新增顶层目录下的“解析版”docx
   2) 用现有 Parser 解析 + 质量过滤
   3) 与现有库(题干前50字同科目)去重 + 新资料内部去重  -> 统计真正可新增
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

# 顶层目录 -> (科目, 批次标签)
ROOT_MAP = [
    ('【学考复习】2024年高中化学学业水平考试必备考点归纳与测试（新教材专用）', '化学', '学考复习'),
    ('【学考复习】2024年高中历史学业水平考试必备考点归纳与测试（新教材专用）', '历史', '学考复习'),
    ('【学考复习】2024年高中地理学业水平考试必备考点归纳与测试（新教材专用）', '地理', '学考复习'),
    ('【学考复习】2024年高中政治学业水平考试必备考点归纳与测试（新教材 12份-3102547', '政治', '学考复习'),
    ('【学考复习】2024年高中数学学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）', '数学', '学考复习'),
    ('【学考复习】2024年高中物理学业水平考试必备考点归纳与测试（新教材专用）11份-3116169', '物理', '学考复习'),
    ('【学考复习】2024年高中生物学业水平考试必备考点归纳与测试（新教材专用）', '生物', '学考复习'),
    ('【学考复习】2024年高中英语学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）(20)份', '英语', '学考复习'),
    ('【学考复习】2024年高中语文学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）', '语文', '学考复习'),
    ('（江苏专用）【学考复习】2024年高中数学学业水平考试必备考点归纳与测试', '数学', '学考复习江苏'),
    ('高中信息技术学业水平考试与学业水平合格考总复习（全国通用）', '信息技术', '总复习'),
    ('高中地理学业水平考试与学业水平合格考总复习（全国通用）', '地理', '总复习'),
    ('高中政治学业水平考试与学业水平合格考总复习（全国通用）', '政治', '总复习'),
    ('高中数学学业水平考试与学业水平合格考总复习（全国通用）', '数学', '总复习'),
    ('高中物理学业水平考试与学业水平合格考总复习（全国通用）', '物理', '总复习'),
    ('高中生物学业水平考试与学业水平合格考总复习（全国通用）', '生物', '总复习'),
    ('高中英语学业水平考试与学业水平合格考总复习（全国通用）', '英语', '总复习'),
    ('高中语文学业水平考试与学业水平合格考总复习（全国通用）', '语文', '总复习'),
    ('G27-高中信息技术学考复习（全国通用）', '信息技术', 'G27'),
    ('化学高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子', '化学', '冲刺卷'),
]

CHAP_CLEAN = re.compile(r'（解析版）|（原卷版）|（知识梳理）|（考点精讲精练+实战训练）|【学考复习】[^（]*$')
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
    # 现有库 tilings
    con = sqlite3.connect(r'E:\saixt\server\data\saixt.db')
    cur = con.cursor()
    existing = collections.defaultdict(set)
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])
    con.close()
    print(f'现有库题干库装载完成\n')

    # 收集所有文件
    jobs = []  # (path, subject, batch)
    for root, subject, batch in ROOT_MAP:
        rp = os.path.join(BASE, root)
        if not os.path.isdir(rp):
            continue
        for p, _, fs in os.walk(rp):
            for f in fs:
                if f.endswith('.docx') and '解析' in f and '原卷' not in f:
                    jobs.append((os.path.join(p, f), subject, batch))
    print('待解析 解析版 docx:', len(jobs))

    by_subject = collections.defaultdict(lambda: {'parsed':0,'pass':0,'new_vs_existing':0,'new_vs_all':0,'files':0})
    seen_new = {}   # (subject, norm50) -> True  新资料内部去重
    reasons = collections.Counter()

    for i, (fp, subject, batch) in enumerate(jobs):
        try:
            qs = parse_docx(fp, subject, chapter_of(fp))
        except Exception as e:
            reasons['异常:' + str(e)[:40]] += 1
            continue
        by_subject[subject]['files'] += 1
        for q in qs:
            by_subject[subject]['parsed'] += 1
            if not quality_check(q):
                reasons['质量不过关'] += 1
                continue
            by_subject[subject]['pass'] += 1
            key = norm(q['stem'])[:50]
            if key and key in existing[subject]:
                continue
            by_subject[subject]['new_vs_existing'] += 1
            nk = (subject, key)
            if nk in seen_new:
                continue
            seen_new[nk] = True
            by_subject[subject]['new_vs_all'] += 1
        if (i+1) % 50 == 0:
            print(f'  进度 {i+1}/{len(jobs)} ...')

    print('\n===== 各科目评估 =====')
    print(f'{"科目":<6}{"文档":>4}{"解析题":>7}{"合格":>6}{"新增(existing)":>10}{"新资料去重后":>10}')
    tot = {'doc':0,'parsed':0,'pass':0,'new_e':0,'new_all':0}
    for s in sorted(by_subject, key=lambda x: -by_subject[x]['parsed']):
        d = by_subject[s]
        print(f'{s:<6}{d["files"]:>4}{d["parsed"]:>7}{d["pass"]:>6}{d["new_vs_existing"]:>10}{d["new_vs_all"]:>10}')
        for k,v in [('doc',d['files']),('parsed',d['parsed']),('pass',d['pass']),('new_e',d['new_vs_existing']),('new_all',d['new_vs_all'])]:
            tot[k]+=v
    print(f'{"合计":<6}{tot["doc"]:>4}{tot["parsed"]:>7}{tot["pass"]:>6}{tot["new_e"]:>10}{tot["new_all"]:>10}')
    print('\n异常/过滤统计:', dict(reasons))

if __name__ == '__main__':
    main()
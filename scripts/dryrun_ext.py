# -*- coding: utf-8 -*-
"""三大新来源 dry-run 预演（不写库）：
   1) 知识扩展库  E:\saixt\(48)...\赠：会考知识扩展库   （9 科目，按子目录名推断）
   2) 化学真题汇编 E:\saixt\化学高中学业水平合格性考试...  （化学）
   3) 历史真题汇编 E:\saixt\历史高中学业水平合格性考试...  （历史）
   统计：解析题数 / 质量合格 / 与现库去重后新增 / 新资料内部去重后净新增 / 章节分布 / 0-parse 文件
"""
import os, re, sys, sqlite3, json, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check, qtype_of

DB_PATH = r'E:\saixt\server\data\saixt.db'

# (来源标签, 根目录, 科目或 None=按子目录推断)
SOURCES = [
    ('知识扩展库',
     r'E:\saixt\(48)高中数学英语文生物理史地政化学业水平合格性考试知识点电子复习\赠：会考知识扩展库',
     None),
    ('化学真题汇编',
     r'E:\saixt\化学高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子',
     '化学'),
    ('历史真题汇编',
     r'E:\saixt\历史高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子',
     '历史'),
]

SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']

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
    cur = con.cursor()
    existing = collections.defaultdict(set)
    for subj, stem in cur.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])
    con.close()
    print(f'现有库题干库装载完成\n')

    # 收集文件
    jobs = []  # (path, subject, source)
    for label, root, fixed_subj in SOURCES:
        if not os.path.isdir(root):
            print(f'[缺目录] {label}: {root}')
            continue
        for p, _, fs in os.walk(root):
            for f in fs:
                if not (f.endswith('.docx') and '解析' in f and '原卷' not in f):
                    continue
                if fixed_subj:
                    subj = fixed_subj
                else:
                    rel = os.path.relpath(p, root)
                    seg = rel.split(os.sep)[0] if rel != '.' else ''
                    subj = seg if seg in SUBJECTS else '未分类'
                jobs.append((os.path.join(p, f), subj, label))
    print('待解析 解析版 docx:', len(jobs))

    by_src = collections.defaultdict(lambda: {'files': 0, 'parsed': 0, 'pass': 0,
                                              'new_e': 0, 'new_all': 0, 'zero': 0})
    by_subject = collections.defaultdict(lambda: {'files': 0, 'parsed': 0, 'pass': 0,
                                                  'new_e': 0, 'new_all': 0, 'zero': 0})
    chapters = collections.defaultdict(collections.Counter)
    seen_new = {}
    reasons = collections.Counter()

    for i, (fp, subject, label) in enumerate(jobs):
        try:
            qs = parse_docx(fp, subject, chapter_of(fp))
        except Exception as e:
            reasons['异常:' + str(e)[:40]] += 1
            continue
        by_src[label]['files'] += 1
        by_subject[subject]['files'] += 1
        if not qs:
            by_src[label]['zero'] += 1
            by_subject[subject]['zero'] += 1
        for q in qs:
            by_src[label]['parsed'] += 1
            by_subject[subject]['parsed'] += 1
            if not quality_check(q):
                reasons['质量不过关'] += 1
                continue
            by_src[label]['pass'] += 1
            by_subject[subject]['pass'] += 1
            key = norm(q['stem'])[:50]
            if key and key in existing[subject]:
                continue
            by_src[label]['new_e'] += 1
            by_subject[subject]['new_e'] += 1
            nk = (subject, key)
            if nk in seen_new:
                continue
            seen_new[nk] = True
            by_src[label]['new_all'] += 1
            by_subject[subject]['new_all'] += 1
            chapters[subject][chapter_of(fp)] += 1
        if (i + 1) % 100 == 0:
            print(f'  进度 {i+1}/{len(jobs)} ...')

    print('\n===== 按来源 =====')
    print(f'{"来源":<10}{"文档":>4}{"0题文件":>6}{"解析题":>7}{"合格":>6}{"新增(existing)":>10}{"净新增":>8}')
    tot = {'files': 0, 'zero': 0, 'parsed': 0, 'pass': 0, 'new_e': 0, 'new_all': 0}
    for label, d in by_src.items():
        print(f'{label:<10}{d["files"]:>4}{d["zero"]:>6}{d["parsed"]:>7}{d["pass"]:>6}{d["new_e"]:>10}{d["new_all"]:>8}')
        for k in tot:
            tot[k] += d[k]
    print(f'{"合计":<10}{tot["files"]:>4}{tot["zero"]:>6}{tot["parsed"]:>7}{tot["pass"]:>6}{tot["new_e"]:>10}{tot["new_all"]:>8}')

    print('\n===== 按科目 =====')
    print(f'{"科目":<6}{"文档":>4}{"0题文件":>6}{"解析题":>7}{"合格":>6}{"新增(existing)":>10}{"净新增":>8}')
    for s in sorted(by_subject, key=lambda x: -by_subject[x]['new_all']):
        d = by_subject[s]
        print(f'{s:<6}{d["files"]:>4}{d["zero"]:>6}{d["parsed"]:>7}{d["pass"]:>6}{d["new_e"]:>10}{d["new_all"]:>8}')

    print('\n===== 章节分布（净新增 Top 30）=====')
    flat = []
    for s, c in chapters.items():
        for ch, n in c.items():
            flat.append((n, s, ch))
    for n, s, ch in sorted(flat, reverse=True)[:30]:
        print(f'{n:>4}  {s}  {ch}')

    print('\n异常/过滤统计:', dict(reasons))

if __name__ == '__main__':
    main()

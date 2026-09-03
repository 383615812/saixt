# -*- coding: utf-8 -*-
"""干跑：信息技术/通用技术 真实试卷类 docx 可净新增量(对现库去重，不写库)。"""
import os, re, sys, sqlite3, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from scripts.paper_parse import parse_docx, quality_check

DB_PATH = r'E:\saixt\server\data\saixt.db'
FILES = r'E:\saixt\信息技术\信息技术试题'


def norm(s):
    return re.sub(r'\s+', '', s or '')


def main():
    con = sqlite3.connect(DB_PATH)
    existing = collections.defaultdict(set)
    for subj, stem in con.execute('SELECT subject, stem FROM questions'):
        existing[subj].add(norm(stem)[:50])
    con.close()

    files = []
    for p, _, fs in os.walk(FILES):
        for f in fs:
            if f.endswith('.docx') and not re.search(r'\(\d\)\.docx$', f):
                files.append(os.path.join(p, f))
    # 去掉 (1)(2) 带括号副本
    files = [f for f in files if not re.search(r'\((\d)\)\s*\.docx$', os.path.basename(f))]
    print('待解析唯一 docx:', len(files))

    by_subj = collections.Counter()
    seen = set()
    err = collections.Counter()
    detail = collections.defaultdict(collections.Counter)
    for fp in files:
        subj = '通用技术' if '通用技术' in fp else '信息技术'
        try:
            qs = parse_docx(fp)
        except Exception as e:
            err['异常'] += 1
            continue
        ok = bad = dup = 0
        for q in qs:
            if not quality_check(q):
                bad += 1
                continue
            key = norm(q['stem'])[:50]
            if not key or key in existing[subj] or (subj, key) in seen:
                dup += 1
                continue
            seen.add((subj, key))
            by_subj[subj] += 1
            ok += 1
        detail[subj][__import__('os').path.basename(fp)[:34]] += ok
    print('\n===== 可净新增 =====')
    for s, c in by_subj.most_common():
        print(f'  {c:5}  {s}')
    print('异常文件:', err['异常'])
    print('\n=== 分文件产出(前25) ===')
    for subj, cnt in detail.items():
        print('--', subj)
        for name, c in sorted(cnt.items(), key=lambda x: -x[1])[:25]:
            if c > 0:
                print(f'  {c:4}  {name}')


if __name__ == '__main__':
    main()
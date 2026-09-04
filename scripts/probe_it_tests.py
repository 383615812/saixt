# -*- coding: utf-8 -*-
"""测试 信息技术试题 目录文件的解析质量（抽样）"""
import os, sys, collections
BASE = r'E:\saixt'
sys.path.insert(0, BASE)
from import_haoti_2026 import Parser, parse_docx, quality_check

DIR = r'E:\saixt\信息技术\信息技术试题'
files = [f for f in os.listdir(DIR) if f.endswith('.docx') and '(1)' not in f and '(2)' not in f]
print('唯一 docx 数:', len(files))

stats = collections.Counter()
samples = []
for f in files:
    fp = os.path.join(DIR, f)
    try:
        qs = parse_docx(fp, '信息技术', '信息技术试题')
    except Exception as e:
        stats['异常'] += 1
        continue
    if not qs:
        stats['0题'] += 1
        continue
    stats['有题'] += 1
    ok = sum(1 for q in qs if quality_check(q))
    stats['合格'] += ok
    stats['总题'] += len(qs)
    samples.append((f, len(qs), ok))

print('统计:', dict(stats))
print('\n===== 抽样明细 =====')
for f, n, ok in samples[:25]:
    print(f'{n:>3}题/{ok:>3}合格  {f}')

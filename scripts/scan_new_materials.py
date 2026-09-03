# -*- coding: utf-8 -*-
"""扫描 9/3 新增题库资料：统计每个顶层目录的 docx 数量、解析版/原卷版/知识梳理分类"""
import os, re, sys
BASE = r'E:\saixt'

# 待扫描的顶层目录（9/3 前后新增）
ROOTS = [
    '【学考复习】2024年高中化学学业水平考试必备考点归纳与测试（新教材专用）',
    '【学考复习】2024年高中历史学业水平考试必备考点归纳与测试（新教材专用）',
    '【学考复习】2024年高中地理学业水平考试必备考点归纳与测试（新教材专用）',
    '【学考复习】2024年高中政治学业水平考试必备考点归纳与测试（新教材 12份-3102547',
    '【学考复习】2024年高中数学学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）',
    '【学考复习】2024年高中物理学业水平考试必备考点归纳与测试（新教材专用）11份-3116169',
    '【学考复习】2024年高中生物学业水平考试必备考点归纳与测试（新教材专用）',
    '【学考复习】2024年高中英语学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）(20)份',
    '【学考复习】2024年高中语文学业水平考试必备考点归纳与测试-（知识梳理+考点精讲精练+实战训练）（新教材专用）',
    '（江苏专用）【学考复习】2024年高中数学学业水平考试必备考点归纳与测试',
    '高中信息技术学业水平考试与学业水平合格考总复习（全国通用）',
    '高中地理学业水平考试与学业水平合格考总复习（全国通用）',
    '高中政治学业水平考试与学业水平合格考总复习（全国通用）',
    '高中数学学业水平考试与学业水平合格考总复习（全国通用）',
    '高中物理学业水平考试与学业水平合格考总复习（全国通用）',
    '高中生物学业水平考试与学业水平合格考总复习（全国通用）',
    '高中英语学业水平考试与学业水平合格考总复习（全国通用）',
    '高中语文学业水平考试与学业水平合格考总复习（全国通用）',
    '信息技术',
    '通用技术',
    'G27-高中信息技术学考复习（全国通用）',
    '化学高中学业水平合格性考试数学英语文生物理史地政化知识点复习电子',
]

def classify(f):
    n = os.path.basename(f)
    if '解析' in n:
        return '解析版'
    if '原卷' in n or '试题' in n or '试卷' in n:
        return '原卷/试题'
    if '知识梳理' in n or '考点归纳' in n or '知识点' in n or '归纳' in n:
        return '知识梳理/归纳'
    return '其他'

for root in ROOTS:
    rp = os.path.join(BASE, root)
    if not os.path.isdir(rp):
        print(f'  [缺目录] {root}')
        continue
    docx = []
    for p, _, fs in os.walk(rp):
        for f in fs:
            if f.endswith('.docx') or f.endswith('.doc'):
                docx.append(os.path.join(p, f))
    from collections import Counter
    c = Counter(classify(d) for d in docx)
    total = len(docx)
    marker = ' <<<<<' if total else ''
    # 展示一个样例文件名帮助识别结构
    sample = ''
    if total:
        # 找解析版样例
        px = [d for d in docx if '解析' in os.path.basename(d)]
        s = os.path.basename(px[0]) if px else os.path.basename(docx[0])
        sample = '  e.g.' + s[:60]
    print(f'{total:4}  {dict(c)}{marker}{sample}')
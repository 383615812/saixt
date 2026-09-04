# -*- coding: utf-8 -*-
"""从学考必备数学专题讲义(解析版)提取"基础知识梳理"段，构建数学知识底座。
   映射到现有题库专题章节名。输出 math_knowledge.json
"""
from docx import Document
import re, json, os, glob

BASE = r'E:\saixt\高中数学学业水平考试与学业水平合格考总复习（全国通用）\【学考必备】2025年高中数学学业水平合格性考试总复习（全国通用，春季高考适用）'
# 讲义目录名 -> 现有库章节名（保留题库中的规范章节）
DIR_TO_TOPIC = {
    '专题01 集合与常用逻辑用语': '专题01 集合与常用逻辑用语',
    '专题02 一元二次函数、方程和不等式': '专题02 一元二次函数、方程和不等式',
    '专题03 函数的概念与性质': '专题03 函数的概念与性质',
    '专题04 指数函数与对数函数': '专题04 指数函数与对数函数',
    '专题05 三角函数': '专题05 三角函数',
    '专题06 平面向量和复数': '专题06 平面向量和复数',
    '专题07 立体几何初步': '专题07 立体几何初步',
    '专题08 统计': '专题08 统计',
    '专题09 概率': '专题09 概率',
}

result = {}
for dname, topic in DIR_TO_TOPIC.items():
    # 目录名带尾缀，用 startswith 匹配
    d = next((os.path.join(BASE, n) for n in os.listdir(BASE)
              if n.startswith(dname) and os.path.isdir(os.path.join(BASE, n))), None)
    if not d:
        print(f'[缺目录] {dname}')
        continue
    # 取解析版
    jx = glob.glob(os.path.join(d, '*解析版*.docx'))
    if not jx:
        print(f'[缺解析版] {dname}')
        continue
    doc = Document(jx[0])
    paras = []
    in_kb = False
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t:
            continue
        if t.startswith('基础知识梳理'):
            in_kb = True
            continue
        # 知识梳理结束后进入考点/例题，停止收集
        if re.match(r'^(点精讲讲练|考点|【考点|实战训练|课时练|综合训练)', t):
            in_kb = False
            continue
        if in_kb:
            paras.append(t)
    text = '\n'.join(paras).strip()
    if len(text) > 3500:
        text = text[:3500]
    if not text:
        print(f'[空知识] {dname}')
        continue
    result[topic] = text
    print(f'[{dname}] -> {topic}, 知识 {len(text)} 字')

OUT = r'E:\saixt\server\data\math_knowledge.json'
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print(f'\n已写出 {OUT}, 章节数 {len(result)}')
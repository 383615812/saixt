# -*- coding: utf-8 -*-
"""构建信息技术知识底座：从粤教版会考复习讲义按章节提取知识点（含必修一+必修二）。
   输出 xi_knowledge.json，供 DeepSeek 按章节出题。
   识别规则：段落中出现 "第X章" 视为新章节；章号回退(如从第六章后到第一章)表示进入必修二。
"""
from docx import Document
import re, json

SRC = r'E:\saixt\信息技术\高中信息技术粤教版（2019）必修1会考复习知识点.docx'
OUT = r'E:\saixt\server\data\xi_knowledge.json'

CN_NUM = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}

# 必修二章节标题映射（章号回退后出现）
VOL2_MAP = {
    '走进信息社会': '信息系统概述',
    '信息系统的组成与功能': '信息系统组成与功能',
    '信息系统的网络组建': '计算机网络组建',
    '信息系统的软件与应用': '信息系统软件与应用',
    '信息系统的安全风险防范': '信息安全风险防范',
}

d = Document(SRC)
chapters = {}   # key -> {'title':..., 'lines':[]}
order = []
cur_key = None
vol = 1
max_num = 0
for p in d.paragraphs:
    t = p.text.strip()
    if not t:
        continue
    m = re.match(r'^\s*(第[一二三四五六七八九十]+章)\s*(.*)$', t)
    if m:
        num = CN_NUM.get(m.group(1)[1], 1)
        title = m.group(2).strip()
        if num <= max_num:
            vol = 2  # 章号回退 => 必修二
        max_num = num
        # 必修二章节用独立命名避免与必修一冲突
        vol2_map = {
            '走进信息社会': '信息系统概述',
            '信息系统的组成与功能': '信息系统组成与功能',
            '信息系统的网络组建': '计算机网络组建',
            '信息系统的软件与应用': '信息系统软件与应用',
            '信息系统的安全风险防范': '信息安全风险防范',
        }
        if vol == 2:
            key = vol2_map.get(title, '必修二_' + title)
        else:
            key = title if title else ('第%d章' % num)
        if key not in chapters:
            chapters[key] = {'title': t, 'lines': [], 'vol': vol}
            order.append(key)
        cur_key = key
        chapters[key]['lines'].append(t)
        continue
    # 必修二已开始，跳过样题
    if t.startswith('典题') or t.startswith('样题'):
        continue
    if len(t) < 2:
        continue
    if cur_key:
        chapters[cur_key]['lines'].append(t)

# 汇总：将讲义章节名映射到现有库专题名
TOPIC_MAP = {
    '数据与信息': '专题01 数据、信息与知识',
    '知识与数字化学习': '专题01 数据、信息与知识',
    '算法基础': '专题03 算法与问题解决',
    '程序设计基础': '专题04 Python程序设计基础',
    '数据处理与可视化表达': '专题02 数据采集与编码',
    '人工智能及其应用': '专题06 人工智能',
    '信息系统概述': '专题07 信息系统概述',
    '信息系统组成与功能': '专题08 信息系统的支撑技术',
    '计算机网络组建': '专题08 信息系统的支撑技术',
    '信息系统软件与应用': '专题09 传感与控制及信息系统软件',
    '信息安全风险防范': '专题10 信息系统的安全',
}

result = {}
for key in order:
    c = chapters[key]
    text = '\n'.join(c['lines']).strip()
    if len(text) > 2500:
        text = text[:2500]
    topic = TOPIC_MAP.get(key, key)
    result[topic] = result.get(topic, '') + '\n' + text
    print('[%s] %s -> %s 知识len=%d' % ('必修二' if c['vol']==2 else '必修一', key, topic, len(text)))

# 截断合并后的长文本
for k in result:
    if len(result[k]) > 3500:
        result[k] = result[k][:3500]

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print('\n已写出:', OUT, ' 章节数:', len(result), ' 章节:', list(result.keys()))
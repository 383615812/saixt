# -*- coding: utf-8 -*-
"""为信息技术专题批量生成补强选择题（调用 DeepSeek，逐章分批）。
   用法: python gen_xi_boost.py [--per-chapter N] [--dry-run]
   知识底座: server/data/xi_knowledge.json
   输出: server/data/generated_xi_questions.json
"""
import os, sys, re, json, time, argparse
sys.path.insert(0, r'E:\saixt\scripts')
from generate_ty_questions import call_deepseek  # 复用 API 调用

KNOWLEDGE = r'E:\saixt\server\data\xi_knowledge.json'
OUT = r'E:\saixt\server\data\generated_xi_questions.json'

SYSTEM_XI = """你是高中信息技术会考出题专家，会根据给定的知识点内容生成符合会考要求的单项选择题。

要求:
1. 每题必须包含: 题干(文字即可，涉及计算时给出清晰数据)、四个选项（ABCD）、正确答案（单个字母）、简洁解析。
2. 题干围绕给定知识点命制，难度与云南高中信息技术学业水平考试相当，考查概念理解与简单应用。
3. 必须严格按照JSON数组输出，不输出多余说明文字。每个题目为JSON对象:
   {"stem": "题干", "options": ["A","B","C","D"], "answer": "A/B/C/D", "analysis": "解析"}
4. 不要输出markdown代码块，直接输出JSON数组。
5. 每个题目考查一个明确考点，知识点覆盖均匀。"""

PROMPT_XI = """以下是高中信息技术「{chapter}」章节知识点，请你基于这些知识点生成 {n} 道单项选择题，考查会考要求的能力。

知识点:
{text}

严格按要求输出JSON数组。"""

def call_xi(chapter, text, n):
    env = {}
    env_path = r'E:\saixt\server\.env'
    for line in open(env_path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip()
    api_key = env.get('DEEPSEEK_API_KEY', '')
    base_url = env.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
    model = env.get('DEEPSEEK_MODEL', 'deepseek-chat')
    import requests
    messages = [
        {'role': 'system', 'content': SYSTEM_XI},
        {'role': 'user', 'content': PROMPT_XI.format(chapter=chapter, text=text, n=n)}
    ]
    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    data = {'model': model, 'messages': messages, 'temperature': 0.7,
            'max_tokens': 200 * n + 200, 'stream': False}
    try:
        resp = requests.post(f'{base_url}/chat/completions', json=data, headers=headers, timeout=120000)
        if not resp.ok:
            print(f'API error {resp.status_code}: {resp.text[:150]}', file=sys.stderr)
            return None
        content = resp.json()['choices'][0]['message']['content'].strip()
        if content.startswith('```'):
            content = re.sub(r'^```(json)?\n', '', content)
            content = re.sub(r'\n```$', '', content)
        questions = json.loads(content)
        if not isinstance(questions, list):
            return None
        ok = []
        for q in questions:
            if not all(k in q for k in ('stem','options','answer','analysis')):
                continue
            if len(q.get('options', [])) != 4 or q.get('answer','').upper() not in 'ABCD':
                continue
            if not (q.get('stem','') and len(q['stem'])>5):
                continue
            ok.append(q)
        print(f'chapter {chapter}: generated {len(questions)}, ok {len(ok)}')
        return ok
    except Exception as e:
        print(f'Exception: {e}', file=sys.stderr)
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--per-batch', type=int, default=8)
    ap.add_argument('--batches', type=int, default=3)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--only', default='')
    args = ap.parse_args()

    knowledge = json.load(open(KNOWLEDGE, encoding='utf-8'))
    print('信息技术知识底座章节:', len(knowledge))

    priority = ['专题03 算法与问题解决', '专题04 Python程序设计基础', '专题02 数据采集与编码',
                '专题01 数据、信息与知识', '专题07 信息系统概述', '专题08 信息系统的支撑技术',
                '专题06 人工智能', '专题09 传感与控制及信息系统软件', '专题10 信息系统的安全']
    chapters = [c for c in priority if c in knowledge]
    print('出题章节:', chapters)

    all_q = []
    for ch in chapters:
        if args.only and args.only not in ch:
            continue
        if args.dry_run:
            print(f'DRY: {ch} 知识 len={len(knowledge[ch])}')
            continue
        for batch in range(args.batches):
            qs = call_xi(ch, knowledge[ch], args.per_batch)
            if qs:
                for q in qs:
                    q['chapter'] = ch
                all_q += qs
            time.sleep(1)
    if all_q:
        with open(OUT, 'w', encoding='utf-8') as f:
            json.dump(all_q, f, ensure_ascii=False)
        print(f'===== 完成 =====\n总题数: {len(all_q)} 写入 {OUT}')
        from collections import Counter
        for c, n in Counter(q['chapter'] for q in all_q).most_common():
            print(f'  {n:3}  {c}')
    else:
        print('未生成任何题(或为dry-run)')

if __name__ == '__main__':
    main()
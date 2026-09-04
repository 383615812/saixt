# -*- coding: utf-8 -*-
"""为数学薄弱专题批量生成补强选择题（调用 DeepSeek）。
   用法: python gen_math_boost.py [--per-batch N] [--batches M] [--dry-run] [--only 子串]
   知识底座: server/data/math_knowledge.json
   输出: server/data/generated_math_questions.json
"""
import os, sys, re, json, time, argparse
sys.path.insert(0, r'E:\saixt\scripts')
from generate_ty_questions import call_deepseek, ENV, load_env

KNOWLEDGE = r'E:\saixt\server\data\math_knowledge.json'
OUT = r'E:\saixt\server\data\generated_math_questions.json'

SYSTEM_MATH = """你是高中数学学业水平（合格考）出题专家，为云南高中数学学业水平考试命制单项选择题。

要求:
1. 每题必须包含: 题干(涉及数据/符号/公式时完整给出，可含数字计算)、四个选项（ABCD）、正确答案（单个字母）、简洁解析（说明考点的求解过程，尤其要验证答案正确性）。
2. 紧扣高中数学合格考知识点，难度为合格考层次（基础为主、少量中等），覆盖: 集合、不等式、函数、指数对数、三角函数、向量复数、立体几何、统计、概率。
3. 数学符号直接使用文本(如 <= >= 平方根写sqrt, 乘方写^)，题干清晰可解。
4. 必须严格按照JSON数组输出，不输出多余文字、不要markdown代码块。每个题目为JSON对象:
   {"stem": "题干", "options": ["A","B","C","D"], "answer": "A/B/C/D", "analysis": "解析"}
5. 每个题目的计算务必准确，选项中唯一正确答案，其余为干扰项。"""

PROMPT_MATH = """以下是高中数学「{chapter}」章节知识点，请你基于这些知识点生成 {n} 道单项选择题，难度与高中数学学业水平合格考相当，考查合格考要求的能力。

知识点:
{text}

严格按要求输出JSON数组，确保计算与答案准确。"""

def call_math(chapter, text, n):
    env = load_env(ENV)
    api_key = env.get('DEEPSEEK_API_KEY', '')
    base_url = env.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
    model = env.get('DEEPSEEK_MODEL', 'deepseek-chat')
    if not api_key:
        print('ERROR: 未配置 DEEPSEEK_API_KEY', file=sys.stderr)
        return None
    import requests
    messages = [
        {'role': 'system', 'content': SYSTEM_MATH},
        {'role': 'user', 'content': PROMPT_MATH.format(chapter=chapter, text=text, n=n)}
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
    print('数学知识底座章节:', list(knowledge.keys()))

    priority = ['专题09 概率', '专题08 统计', '专题01 集合与常用逻辑用语',
                '专题02 一元二次函数、方程和不等式', '专题04 指数函数与对数函数',
                '专题03 函数的概念与性质', '专题07 立体几何初步', '专题06 平面向量和复数',
                '专题05 三角函数']
    chapters = [c for c in priority if c in knowledge]
    print('出题章节:', chapters)

    all_q = []
    for ch in chapters:
        if args.only and args.only not in ch:
            continue
        if args.dry_run:
            print(f'DRY: {ch} 知识 len={len(knowledge[ch])}')
            continue
        for _ in range(args.batches):
            qs = call_math(ch, knowledge[ch], args.per_batch)
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
# -*- coding: utf-8 -*-
"""为政治4大主题批量生成补强选择题（调用 DeepSeek）。
   用法: python gen_pol_boost.py [--per-batch N] [--batches M] [--dry-run] [--only 子串]
   知识底座: server/data/pol_knowledge.json
   输出: server/data/generated_pol_questions.json
"""
import os, sys, re, json, time, argparse
sys.path.insert(0, r'E:\saixt\scripts')
from generate_ty_questions import ENV, load_env

KNOWLEDGE = r'E:\saixt\server\data\pol_knowledge.json'
OUT = r'E:\saixt\server\data\generated_pol_questions.json'

SYSTEM_POL = """你是高中思想政治学业水平（合格考）出题专家，为云南高中思想政治学业水平考试命制单项选择题。

要求:
1. 紧扣高中思想政治统编版必修一至必修四知识点（中国特色社会主义、经济与社会、政治与法治、哲学与文化），结合时政与生活情境命制。
2. 每题必须包含: 典型情境或材料导引的题干、四个选项（ABCD）、正确答案（单个字母）、简洁解析（点明所考查原理并解释对错）。
3. 难度为合格考层次（基础为主、适量中等），重点考查学科核心概念的准确理解与辨析，杜绝生僻超纲表述。
4. 必须严格按照JSON数组输出，不输出多余文字、不要markdown代码块。每个题目为JSON对象:
   {"stem": "题干", "options": ["A","B","C","D"], "answer": "A/B/C/D", "analysis": "解析"}
5. 选项设置要有梯度，正确项表述严谨，干扰项利用常见误区设置。"""

PROMPT_POL = """以下是高中思想政治「{chapter}」主题的知识点，请你基于这些知识点生成 {n} 道单项选择题，难度与高中思想政治学业水平合格考相当，考查合格考要求的能力。

知识点:
{text}

严格按要求输出JSON数组，确保答案与解析准确。"""

def call_pol(chapter, text, n):
    env = load_env(ENV)
    api_key = env.get('DEEPSEEK_API_KEY', '')
    base_url = env.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
    model = env.get('DEEPSEEK_MODEL', 'deepseek-chat')
    if not api_key:
        print('ERROR: 未配置 DEEPSEEK_API_KEY', file=sys.stderr)
        return None
    import requests
    messages = [
        {'role': 'system', 'content': SYSTEM_POL},
        {'role': 'user', 'content': PROMPT_POL.format(chapter=chapter, text=text, n=n)}
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
            opts = q.get('options', [])
            if not isinstance(opts, list) or len(opts) != 4:
                continue
            answer = q.get('answer','').upper() if isinstance(q.get('answer'), str) else ''
            ans_letter = answer[0] if answer in 'ABCD' else ''
            if not ans_letter:
                continue
            if not (q.get('stem','') and len(q['stem'])>5):
                continue
            # 去除选项前缀 "A. " "B. " 等
            cleaned = []
            for o in opts:
                o = str(o).strip()
                m = re.match(r'^[A-D][.、)）:：\s]+', o)
                if m:
                    o = o[m.end():].strip()
                cleaned.append(o)
            q['options'] = cleaned
            q['answer'] = ans_letter
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
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()

    knowledge = json.load(open(KNOWLEDGE, encoding='utf-8'))
    print('政治知识底座主题:', list(knowledge.keys()))

    priority = ['专题01 《中国特色社会主义》', '专题03 《经济与社会》',
                '专题05 《政治与法治》', '专题07 《哲学与文化》']
    chapters = [c for c in priority if c in knowledge]
    print('出题主题:', chapters)

    all_q = []
    for ch in chapters:
        if args.only and args.only not in ch:
            continue
        if args.dry_run:
            print(f'DRY: {ch} 知识 len={len(knowledge[ch])}')
            continue
        for _ in range(args.batches):
            qs = call_pol(ch, knowledge[ch], args.per_batch)
            if qs:
                for q in qs:
                    q['chapter'] = ch
                all_q += qs
            time.sleep(1)
    if all_q:
        prev = []
        if os.path.exists(args.out):
            try:
                prev = json.load(open(args.out, encoding='utf-8'))
            except Exception:
                prev = []
        combined = prev + all_q
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(combined, f, ensure_ascii=False)
        print(f'===== 完成 =====\n本次新增: {len(all_q)}, 累计: {len(combined)} 写入 {args.out}')
        from collections import Counter
        for c, n in Counter(q['chapter'] for q in combined).most_common():
            print(f'  {n:3}  {c}')
    else:
        print('未生成任何题(或为dry-run)')

if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""调用 DeepSeek API: 按通用技术知识点生成选择题, 严格要求 JSON 输出格式。
Usage: python generate_ty_questions.py [--dry-run] --limit N  --per-chapter M
输出: 生成后写入 questions.json (可导入)
"""
import os, sys, re, json, argparse
import requests

ENV = r'E:\saixt\server\.env'
KNOWLEDGE = r'E:\saixt\server\data\ty_knowledge.json'
OUT_JSON = r'E:\saixt\server\data\generated_ty_questions.json'

SYSTEM = """你是高中通用技术会考出题专家，会根据给定的知识点内容生成符合会考要求的单项选择题。

要求:
1. 每题必须包含: 题干(四个选项都是文字，不涉及画图尺寸等可视化内容，适合文字作答)、四个选项（ABCD）、正确答案（单个字母A/B/C/D）、简洁解析（针对为什么选对选错解释）。
2. 题干围绕给定知识点命制，难度与云南春季招生会考相当。
3. 必须严格按照JSON数组输出，不输出多余说明文字。每个题目为JSON对象:
   {
     "stem": "题干文字",
     "options": ["选项A文字","选项B文字","选项C文字","选项D文字"],
     "answer": "A/B/C/D",
     "analysis": "解析文字（可以简洁）"
   }
4. 不要输出markdown代码块（不要```包裹），不要额外解释，直接输出JSON数组即可。
5. 每个题目考查一个明确考点，知识点覆盖均匀。"""


PROMPT = """以下是通用技术「{chapter}」章节知识点，请你基于这些知识点生成 {n} 道单项选择题，考查会考要求的能力。

知识点:
{text}

严格按要求输出JSON数组。"""

def load_env(path):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip()
    return env


def call_deepseek(chapter, text, n_questions):
    env = load_env(ENV)
    api_key = env.get('DEEPSEEK_API_KEY', '')
    base_url = env.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
    model = env.get('DEEPSEEK_MODEL', 'deepseek-chat')
    if not api_key:
        print('ERROR: 未配置 DEEPSEEK_API_KEY', file=sys.stderr)
        return None
    messages = [
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': PROMPT.format(chapter=chapter, text=text, n=n_questions)}
    ]
    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    data = {
        'model': model,
        'messages': messages,
        'temperature': 0.7,
        'max_tokens': 200 * n_questions + 200,
        'stream': False
    }
    try:
        resp = requests.post(f'{base_url}/chat/completions', json=data, headers=headers, timeout=120000)
        if not resp.ok:
            print(f'API error {resp.status_code}: {resp.text[:200]}', file=sys.stderr)
            return None
        js = resp.json()
        content = js['choices'][0]['message']['content'].strip()
        # 清洁 markdown 包裹
        if content.startswith('```'):
            content = re.sub(r'^```(json)?\n', '', content)
            content = re.sub(r'\n```$', '', content)
        # 尝试解析
        questions = json.loads(content)
        if not isinstance(questions, list):
            print('not a list', file=sys.stderr)
            return None
        ok = []
        bad = 0
        for q in questions:
            if not all(k in q for k in ('stem','options','answer','analysis')):
                bad += 1; continue
            if len(q.get('options',[])) != 4:
                bad += 1; continue
            if q.get('answer','').strip().upper() not in 'ABCD':
                bad += 1; continue
            if not (q.get('stem','') and len(q['stem'])>5):
                bad += 1; continue
            ok.append(q)
        print(f'chapter {chapter}: generated {len(questions)}, filtered {bad} bad, ok {len(ok)}')
        return ok
    except Exception as e:
        print(f'Exception: {e}', file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--per-chapter', type=int, default=15, help='每题生成数量')
    ap.add_argument('--only', default='', help='只生成包含该子串的章节(调试)')
    ap.add_argument('--dry-run', action='store_true', help='只打印结构不请求API')
    args = ap.parse_args()

    with open(KNOWLEDGE, 'r', encoding='utf-8') as f:
        chapters = json.load(f)
    print('加载知识底座: %d 章节' % len(chapters))
    total_questions = []
    for chap_name, text in chapters.items():
        if args.only and args.only not in chap_name:
            continue
        if args.dry_run:
            print(f'DRY: {chap_name}  text len={len(text)}')
            continue
        res = call_deepseek(chap_name, text, args.per_chapter)
        if res:
            for q in res:
                q['chapter'] = chap_name
            total_questions += res
    if not args.dry_run:
        with open(OUT_JSON, 'w', encoding='utf-8') as f:
            json.dump(total_questions, f, ensure_ascii=False)
        print(f'===== 完成 =====\n总题数: {len(total_questions)} 写入 {OUT_JSON}')

if __name__ == '__main__':
    main()
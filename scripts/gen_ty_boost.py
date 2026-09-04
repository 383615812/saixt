# -*- coding: utf-8 -*-
"""为通用技术薄弱章节批量生成补强选择题（调用 DeepSeek，逐章分批）。
   用法: python gen_ty_boost.py [--per-chapter N] [--dry-run]
   输出: server/data/generated_ty_questions.json
"""
import os, sys, re, json, time
sys.path.insert(0, r'E:\saixt\scripts')
from generate_ty_questions import load_env, call_deepseek  # 复用 API 调用

KNOWLEDGE = r'E:\saixt\server\data\ty_knowledge.json'
OUT = r'E:\saixt\server\data\generated_ty_questions.json'

def main():
    dry = '--dry-run' in sys.argv
    per_batch = 8  # 每次 API 生成题数
    knowledge = json.load(open(KNOWLEDGE, encoding='utf-8'))
    print('知识底座章节:', len(knowledge))

    # 优先补强薄弱章节的顺序
    priority = ['技术的性质与作用', '设计的过程与评价', '设计图样与方案构思',
                '制作原型及模型', '技术设计的一般过程']
    chapters = [c for c in priority if c in knowledge] + \
               [c for c in knowledge if c not in priority]
    print('出题章节顺序:', chapters)

    all_q = []
    for ch in chapters:
        if dry:
            print(f'DRY: {ch} 得知 len={len(knowledge[ch])}')
            continue
        # 每章生成 3 批，每批 per_batch 题 => 每章 ~24 题
        for batch in range(3):
            qs = call_deepseek(ch, knowledge[ch], per_batch)
            if qs:
                for q in qs:
                    q['chapter'] = ch
                all_q += qs
                print(f'  {ch} 批{batch+1}: +{len(qs)}')
            else:
                print(f'  {ch} 批{batch+1}: 失败')
            time.sleep(1)  # 避免限流

    if not dry:
        with open(OUT, 'w', encoding='utf-8') as f:
            json.dump(all_q, f, ensure_ascii=False)
        print(f'===== 完成 =====\n总题数: {len(all_q)} 写入 {OUT}')
        from collections import Counter
        for c, n in Counter(q['chapter'] for q in all_q).most_common():
            print(f'  {n:3}  {c}')

if __name__ == '__main__':
    main()
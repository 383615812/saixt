# -*- coding: utf-8 -*-
import json

data = json.load(open(r'E:\saixt\exam_papers\refined_image.json', encoding='utf-8'))
if isinstance(data, dict):
    data = data.get('questions', data.get('data', []))
still = [r for r in data if r.get('needs_image')]
print('图片题数:', len(still))
for i, q in enumerate(still):
    print(f"[{i+1}] answer='{q.get('answer','')}' analysis='{(q.get('analysis') or '')[:40]}' | {q['stem'][:40]}")

# -*- coding: utf-8 -*-
import json

with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)

def show(source, rng):
    print(f'\n=== {source} 块{rng[0]}-{rng[1]} ===')
    for i in range(rng[0], rng[1] + 1):
        b = docx_map[source][i]
        print(f'{i}: {b["text"][:60]} | 图:{b["images"]}')

show('110份', (10, 18))
show('110份 (2)', (40, 58))
show('周测五(65份)', (5, 40))
show('通用周测四（60份）', (2, 8))
show('通用模拟测试题（130份）', (16, 32))

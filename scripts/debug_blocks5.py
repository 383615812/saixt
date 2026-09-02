# -*- coding: utf-8 -*-
import json

with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)

print('=== 通用周测一 块50-66 ===')
for i in range(50, 67):
    b = docx_map['通用周测一（10份）'][i]
    print(f'{i}: {b["text"][:70]} | 图:{b["images"]}')

print('\n=== 通用周测四 块0-10 ===')
for i in range(0, 11):
    b = docx_map['通用周测四（60份）'][i]
    print(f'{i}: {b["text"][:70]} | 图:{b["images"]}')

# -*- coding: utf-8 -*-
import json

with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)

print('=== 110份 (2) 块24-40 ===')
for i in range(24, 41):
    b = docx_map['110份 (2)'][i]
    print(f'{i}: {b["text"][:70]} | 图:{b["images"]}')

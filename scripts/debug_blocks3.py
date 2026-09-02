# -*- coding: utf-8 -*-
import json

with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)

print('=== 通用周测三 块68-88 ===')
for i in range(68, 89):
    b = docx_map['通用周测三(125份）'][i]
    print(f'{i}: {b["text"][:60]} | 图:{b["images"]}')

# -*- coding: utf-8 -*-
import json, re

def norm(s):
    return re.sub(r'[\s（）()。，,、：:；;？?【】\[\]“”"\'．.\-]', '', str(s))

with open(r'E:\saixt\server\public\qimages\_docx_mapping.json', encoding='utf-8') as f:
    docx_map = json.load(f)

# 通用周测四 块30-45
print('=== 通用周测四 块28-45 ===')
for i in range(28, 46):
    b = docx_map['通用周测四（60份）'][i]
    print(f'{i}: {b["text"][:70]} | 图:{b["images"]}')

print('\n=== 通用周测四 块55-65 ===')
for i in range(55, 66):
    b = docx_map['通用周测四（60份）'][i]
    print(f'{i}: {b["text"][:70]} | 图:{b["images"]}')

print('\n=== 通用模拟测试题 块10-32 ===')
for i in range(10, 33):
    b = docx_map['通用模拟测试题（130份）'][i]
    print(f'{i}: {b["text"][:70]} | 图:{b["images"]}')

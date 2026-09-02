# -*- coding: utf-8 -*-
"""查看PDF页面文本与图片位置，用于精确匹配"""
import pdfplumber, sys

path = sys.argv[1] if len(sys.argv) > 1 else r'E:\saixt\exam_papers\试卷\信息周测二（125份）.pdf'
with pdfplumber.open(path) as pdf:
    for pi, page in enumerate(pdf.pages):
        print(f'\n{"="*50} 第{pi+1}页 {"="*50}')
        text = page.extract_text() or ''
        print(text)
        print(f'--- 图片位置 ---')
        for im in page.images:
            print(f"  {im.get('name','?')} x0={im.get('x0',0):.0f} x1={im.get('x1',0):.0f} top={im.get('top',0):.0f} bottom={im.get('bottom',0):.0f} w={im.get('width',0):.0f} h={im.get('height',0):.0f}")

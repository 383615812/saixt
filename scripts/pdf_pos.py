# -*- coding: utf-8 -*-
"""查看PDF各页图片位置及附近文本，用于精确匹配"""
import pdfplumber, sys

def analyze(path):
    print(f'\n########## {path.split(chr(92))[-1]} ##########')
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            imgs = page.images
            if not imgs:
                continue
            print(f'\n--- 第{pi+1}页 图片数:{len(imgs)} ---')
            # 提取带位置的词
            words = page.extract_words()
            for im in imgs:
                im_top = im.get('top', 0)
                im_bottom = im.get('bottom', 0)
                # 找图片上方的文本行
                above = [w['text'] for w in words if w['bottom'] < im_top + 5 and w['top'] > im_top - 60]
                below = [w['text'] for w in words if w['top'] > im_bottom - 5 and w['top'] < im_bottom + 60]
                print(f"  {im.get('name','?')} top={im_top:.0f} bot={im_bottom:.0f} w={im.get('width',0):.0f} h={im.get('height',0):.0f}")
                print(f"    上方文本: {' '.join(above[-8:])[:80]}")
                print(f"    下方文本: {' '.join(below[:8])[:80]}")

for p in [r'E:\saixt\exam_papers\试卷\信息周测四（60份）.pdf',
          r'E:\saixt\exam_papers\试卷\信息周测五（65份）.pdf']:
    analyze(p)

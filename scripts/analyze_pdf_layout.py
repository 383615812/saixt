# -*- coding: utf-8 -*-
"""分析信息周测二 PDF 的文本与图片布局"""
import pdfplumber

PDF = r'E:\saixt\exam_papers\试卷\信息周测二（125份）.pdf'
with pdfplumber.open(PDF) as pdf:
    print('总页数:', len(pdf.pages))
    for pi, page in enumerate(pdf.pages):
        print(f'\n===== 第 {pi+1} 页 =====')
        # 提取图片
        imgs = page.images
        print(f'图片数: {len(imgs)}')
        for im in imgs:
            print(f'  img: x0={im["x0"]:.0f} x1={im["x1"]:.0f} top={im["top"]:.0f} bottom={im["bottom"]:.0f} w={im["x1"]-im["x0"]:.0f} h={im["bottom"]-im["top"]:.0f}')
        # 提取文本（带位置）
        words = page.extract_words()
        # 按行聚合
        lines = {}
        for w in words:
            key = round(w['top'] / 5) * 5
            lines.setdefault(key, []).append(w)
        for top in sorted(lines):
            ws = sorted(lines[top], key=lambda w: w['x0'])
            text = ' '.join(w['text'] for w in ws)
            if text.strip():
                print(f'  [{top:5.0f}] {text[:90]}')

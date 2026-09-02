# -*- coding: utf-8 -*-
"""检查通用周测三(125份）.docx 中散热垫题附近的图片"""
import zipfile, os, re

DOCX = r'E:\saixt\exam_papers\试卷\通用周测三(125份）.docx'

# 用 zipfile 列出文档内所有图片
with zipfile.ZipFile(DOCX) as z:
    names = z.namelist()
    imgs = [n for n in names if n.startswith('word/media/')]
    print('文档内图片数量:', len(imgs))
    for i in imgs:
        info = z.getinfo(i)
        print(f'  {i}  {info.file_size} bytes')

# -*- coding: utf-8 -*-
"""分析DOCX文档的图文顺序结构，用于图片与题目匹配"""
import docx
from docx.document import Document as _Doc
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
import os, sys

def iter_block_items(parent):
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)

def extract_docx_flow(path, max_items=200):
    doc = docx.Document(path)
    items = []
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            # 检查段落内是否有图片
            has_img = bool(block._element.findall('.//' + qn('a:blip')))
            if text or has_img:
                items.append(('P', text[:80], has_img))
        else:  # Table
            items.append(('T', f'[表格 {len(block.rows)}x{len(block.columns)}]', False))
    return items

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else r'E:\saixt\exam_papers\试卷\通用周测四（60份）.docx'
    items = extract_docx_flow(path)
    for i, (t, txt, img) in enumerate(items):
        marker = ' [图]' if img else ''
        print(f'{i:3d} {t} {txt}{marker}')

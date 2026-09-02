# -*- coding: utf-8 -*-
"""从DOCX试卷中按文档顺序提取图片，保存到 server/public/qimages/{source}/"""
import docx
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
import os, json, glob, re

OUT_ROOT = r'E:\saixt\server\public\qimages'
PAPER_DIR = r'E:\saixt\exam_papers\试卷'

def iter_block_items(parent):
    for child in parent.element.body.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)

def extract_imgs_from_paragraph(doc, para):
    """返回段落中所有图片的二进制数据"""
    imgs = []
    for blip in para._element.findall('.//' + qn('a:blip')):
        rid = blip.get(qn('r:embed'))
        if rid and rid in doc.part.related_parts:
            part = doc.part.related_parts[rid]
            imgs.append(part.blob)
    return imgs

def extract_imgs_from_table(doc, table):
    imgs = []
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                imgs.extend(extract_imgs_from_paragraph(doc, para))
    return imgs

def process_docx(path, source):
    doc = docx.Document(path)
    out_dir = os.path.join(OUT_ROOT, source)
    os.makedirs(out_dir, exist_ok=True)
    blocks = []
    img_counter = 0
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            imgs = extract_imgs_from_paragraph(doc, block)
        else:
            text = '[表格]'
            imgs = extract_imgs_from_table(doc, block)
        if not text and not imgs:
            continue
        img_paths = []
        for blob in imgs:
            img_counter += 1
            ext = 'png'
            # 简单判断格式
            if blob[:3] == b'\xff\xd8\xff':
                ext = 'jpg'
            elif blob[:8] == b'\x89PNG\r\n\x1a\n':
                ext = 'png'
            elif blob[:4] == b'GIF8':
                ext = 'gif'
            fname = f'img_{img_counter:03d}.{ext}'
            with open(os.path.join(out_dir, fname), 'wb') as f:
                f.write(blob)
            img_paths.append(f'{source}/{fname}')
        blocks.append({'text': text, 'images': img_paths})
    return blocks

def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    mapping = {}
    for f in glob.glob(os.path.join(PAPER_DIR, '*.docx')):
        source = os.path.splitext(os.path.basename(f))[0]
        blocks = process_docx(f, source)
        mapping[source] = blocks
        n_img = sum(len(b['images']) for b in blocks)
        print(f'{source}: {len(blocks)}块, {n_img}张图')
    with open(os.path.join(OUT_ROOT, '_docx_mapping.json'), 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1)
    print('完成，映射已保存')

if __name__ == '__main__':
    main()

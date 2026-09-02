# -*- coding: utf-8 -*-
"""从PDF试卷中提取图片（按页面顺序），保存到 server/public/qimages/{source}/"""
import pdfplumber
import os, json, glob

OUT_ROOT = r'E:\saixt\server\public\qimages'
PAPER_DIR = r'E:\saixt\exam_papers\试卷'

def sanitize(name):
    return name.strip().replace(' ', '_')

def extract_pdf_images(path, source):
    source = sanitize(source)
    out_dir = os.path.join(OUT_ROOT, source)
    os.makedirs(out_dir, exist_ok=True)
    pages = []
    img_counter = 0
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            imgs = []
            for im in page.images:
                img_counter += 1
                stream = im.get('stream')
                if stream is None:
                    continue
                data = stream.get_data()
                # 判断格式
                ext = 'png'
                if data[:3] == b'\xff\xd8\xff':
                    ext = 'jpg'
                elif data[:8] == b'\x89PNG\r\n\x1a\n':
                    ext = 'png'
                fname = f'img_{img_counter:03d}.{ext}'
                with open(os.path.join(out_dir, fname), 'wb') as f:
                    f.write(data)
                imgs.append({
                    'path': f'{source}/{fname}',
                    'x0': round(im.get('x0', 0), 1),
                    'x1': round(im.get('x1', 0), 1),
                    'top': round(im.get('top', 0), 1),
                    'bottom': round(im.get('bottom', 0), 1),
                    'w': round(im.get('width', 0), 1),
                    'h': round(im.get('height', 0), 1),
                })
            pages.append({'page': pi + 1, 'text': text, 'images': imgs})
    return pages

def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    mapping = {}
    for f in glob.glob(os.path.join(PAPER_DIR, '*.pdf')):
        source = sanitize(os.path.splitext(os.path.basename(f))[0])
        pages = extract_pdf_images(f, source)
        mapping[source] = pages
        n_img = sum(len(p['images']) for p in pages)
        print(f'{source}: {len(pages)}页, {n_img}张图')
    with open(os.path.join(OUT_ROOT, '_pdf_mapping.json'), 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1)
    print('完成，映射已保存')

if __name__ == '__main__':
    main()

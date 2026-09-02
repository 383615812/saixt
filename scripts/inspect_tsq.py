# -*- coding: utf-8 -*-
import os, glob

d = r'E:\saixt\exam_papers\tsq'
files = glob.glob(os.path.join(d, '*.tsq'))
print('文件数:', len(files))
f = files[0]
print('文件:', os.path.basename(f))
with open(f, 'rb') as fh:
    data = fh.read(512)
print('HEX:', data[:80].hex())
print('ASCII:', ''.join(chr(b) if 32 <= b <= 126 else '.' for b in data[:256]))

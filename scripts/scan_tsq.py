# -*- coding: utf-8 -*-
import os, glob, re

d = r'E:\saixt\exam_papers\tsq'
files = glob.glob(os.path.join(d, '*.tsq'))
print('文件数:', len(files))

# 扫描可读字符串（UTF-8中文）
def find_strings(path):
    with open(path, 'rb') as f:
        data = f.read()
    # 尝试UTF-8解码
    try:
        text = data.decode('utf-8', errors='ignore')
        chinese = re.findall(r'[\u4e00-\u9fff]{2,}', text)
        return chinese[:20]
    except:
        return []

for f in files[:5]:
    ch = find_strings(f)
    print(os.path.basename(f), '->', len(ch), '个中文字符串:', ch[:10])

# 检查是否有zlib/gzip等压缩特征
with open(files[0], 'rb') as f:
    data = f.read()
print('\n文件大小:', len(data))
print('开头16字节:', data[:16].hex())
print('结尾16字节:', data[-16:].hex())
# 检查熵
import collections
freq = collections.Counter(data)
entropy = -sum((c/len(data)) * __import__('math').log2(c/len(data)) for c in freq.values())
print('熵值(8为完全随机):', round(entropy, 2))

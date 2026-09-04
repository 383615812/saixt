# -*- coding: utf-8 -*-
"""王牌专业字符串精洗：去 K(国控)标记、去说明碎片、校正已知脏值。"""
import sqlite3, re
DB = r'E:\saixt\server\data\saixt.db'
con = sqlite3.connect(DB); c = con.cursor()
rows = c.execute('SELECT code, flagship FROM schools').fetchall()
up = {}
for code, fl in rows:
    if not fl:
        continue
    s = fl
    s = re.sub(r'\s*K\b', '', s)                      # 国控 K 标记
    s = re.sub(r'校本部：|校本部:', '', s)             # 校区前缀
    s = s.replace(')、', '、').replace('(', '').replace(')', '')
    s = re.sub(r'[，,]\s*', '、', s)
    s = re.sub(r'\s+', ' ', s).strip(' 、')
    # 去掉 "形象气质俱佳无色盲、无色弱、无纹身" 类注条残留(无分隔且过长成语)
    parts = [p.strip() for p in re.split(r'、', s) if p.strip()]
    parts = [p for p in parts if not re.search(r'身高|色盲|色弱|纹身|形象气质|俱佳', p)]
    s = '、'.join(parts)
    up[code] = s
# 特例
up['5394'] = '空中乘务'
up['5376'] = ''
# 5359 昆明科技职大(原经贸外事)：用 Sheet1 云南经贸外事 王牌专业补
up['5359'] = '城市轨道交通工程技术、护理、工程测量技术、酒店管理与数字化运营'
for code, s in up.items():
    c.execute('UPDATE schools SET flagship=? WHERE code=?', (s, code))
con.commit()
print('清洗完成，样例抽查:')
for code in ['5322', '5365', '5388', '5352', '5390', '5329', '5394', '5376', '5359', '5326']:
    print('  ', code, '->', c.execute('SELECT flagship FROM schools WHERE code=?', (code,)).fetchone()[0])
con.close()
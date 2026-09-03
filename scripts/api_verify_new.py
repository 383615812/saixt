# -*- coding: utf-8 -*-
"""本地 API 验证：登录后查询题库 meta / 知识图谱连通性"""
import json, urllib.request
BASE = 'http://localhost:3000'

def post(path, payload, token=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())

def get(path, token=None):
    req = urllib.request.Request(BASE + path)
    if token: req.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())

try:
    lg = post('/api/auth/login', {'phone': '13800000099', 'password': 'Test@123456'})
    token = lg.get('data', {}).get('token', '') or lg.get('token', '')
    print('登录:', bool(token))
except Exception as e:
    print('登录失败:', e); raise SystemExit(1)

try:
    meta = get('/api/questions/meta', token)
    d = meta.get('data', meta)
    # 尝试打印总数
    if isinstance(d, dict):
        print('meta keys:', list(d.keys())[:10])
        print('meta subjects:', len(d.get('subjects', [])) if isinstance(d.get('subjects'), list) else 'n/a')
        # 汇总各 subject 计数
        tot = 0
        for subj in (d.get('subjects') or []):
            if isinstance(subj, dict):
                c = subj.get('count', subj.get('total', 0))
                tot += c or 0
                print('   ', subj.get('name', subj.get('subject')), c)
        print('subject 计数合计:', tot)
    else:
        print('meta:', str(d)[:200])
except Exception as e:
    print('meta 查询失败:', e)

try:
    kg = get('/api/questions/knowledge-graph', token)
    kd = kg.get('data', kg)
    if isinstance(kd, dict):
        nodes = kd.get('nodes') or []
        edges = kd.get('edges') or []
        print(f'知识图谱 nodes={len(nodes)} edges={len(edges)}')
        # 检查是否有孤立节点（无任何边）
    else:
        print('kg:', str(kd)[:150])
except Exception as e:
    print('kg 查询失败:', e)
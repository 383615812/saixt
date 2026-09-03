# -*- coding: utf-8 -*-
"""清理真重复题：保留解析最完整版本，重定向用户引用，删除其余。
用法: python clean_dups.py <db路径> [--apply]
默认 dry-run 只报告不修改。"""
import sqlite3, re, collections, sys

DB = sys.argv[1] if len(sys.argv) > 1 else r'E:\saixt\server\data\saixt.db'
APPLY = '--apply' in sys.argv

def norm(s):
    return re.sub(r'\s+', '', s or '')

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

rows = cur.execute('SELECT id, subject, stem, analysis FROM questions').fetchall()
full = collections.defaultdict(list)
for r in rows:
    full[(r['subject'], norm(r['stem']))].append(r)

groups = {k: v for k, v in full.items() if len(v) > 1}
print(f'重复组: {len(groups)}, 多余记录: {sum(len(v)-1 for v in groups.values())}')

# 选择保留者：解析最长优先，其次 id 最小
keep_ids = set()
del_map = {}  # del_id -> keep_id
by_subj = collections.Counter()
for k, recs in groups.items():
    keeper = max(recs, key=lambda r: (len(norm(r['analysis'] or '')), -r['id']))
    keep_ids.add(keeper['id'])
    by_subj[k[0]] += len(recs) - 1
    for r in recs:
        if r['id'] != keeper['id']:
            del_map[r['id']] = keeper['id']

print('按科目多余分布:', dict(by_subj))
print(f'待删除: {len(del_map)}, 保留: {len(keep_ids)}')

# 检查引用
ref_tables = ['practice_records', 'review_schedule', 'favorites', 'wrong_mastered', 'blind_box_draws']
ref_counts = {}
for t in ref_tables:
    try:
        c = cur.execute(f'SELECT COUNT(*) FROM {t} WHERE question_id IN ({",".join("?"*len(del_map))})', list(del_map)).fetchone()[0]
        ref_counts[t] = c
    except Exception as e:
        ref_counts[t] = f'ERR {e}'
print('引用情况:', ref_counts)

if not APPLY:
    print('\n[dry-run] 未修改任何数据。加 --apply 执行。')
    con.close()
    sys.exit(0)

# 执行：先重定向引用，再删除
con.execute('BEGIN IMMEDIATE')
for t in ref_tables:
    for del_id, keep_id in del_map.items():
        try:
            cur.execute(f'UPDATE {t} SET question_id=? WHERE question_id=?', (keep_id, del_id))
        except Exception:
            pass
cur.executemany('DELETE FROM questions WHERE id=?', [(i,) for i in del_map])
con.commit()

final = cur.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
print(f'\n[已执行] 删除 {len(del_map)} 条重复，题库总数: {final}')
con.close()

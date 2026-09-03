// 生产清理真重复题：保留解析最完整版本，重定向用户引用，删除其余
const { DatabaseSync } = require('node:sqlite');
const DB = '/opt/saixt/server/data/saixt.db';

function norm(s) { return String(s || '').replace(/\s+/g, ''); }

const db = new DatabaseSync(DB);
db.exec('PRAGMA busy_timeout=10000');
db.exec('PRAGMA synchronous=FULL');

const rows = db.prepare('SELECT id, subject, stem, analysis FROM questions').all();
const full = new Map();
for (const r of rows) {
  const k = `${r.subject}\u0000${norm(r.stem)}`;
  if (!full.has(k)) full.set(k, []);
  full.get(k).push(r);
}

const groups = [...full.values()].filter(v => v.length > 1);
const delMap = new Map();
let keepIds = new Set();
for (const recs of groups) {
  // 保留解析最长，其次 id 最小
  let keeper = recs[0];
  for (const r of recs) {
    const kScore = norm(keeper.analysis || '').length;
    const rScore = norm(r.analysis || '').length;
    if (rScore > kScore || (rScore === kScore && r.id < keeper.id)) keeper = r;
  }
  keepIds.add(keeper.id);
  for (const r of recs) {
    if (r.id !== keeper.id) delMap.set(r.id, keeper.id);
  }
}
console.log(`重复组: ${groups.length}, 待删除: ${delMap.size}`);

const refTables = ['practice_records', 'review_schedule', 'favorites', 'wrong_mastered', 'blind_box_draws'];
const delIds = [...delMap.keys()];
for (const t of refTables) {
  try {
    const ph = delIds.map(() => '?').join(',');
    const c = db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE question_id IN (${ph})`).get(...delIds).c;
    console.log(`  ${t} 引用: ${c}`);
  } catch (e) { console.log(`  ${t}: ERR ${e.message}`); }
}

db.exec('BEGIN IMMEDIATE');
for (const t of refTables) {
  try {
    const upd = db.prepare(`UPDATE ${t} SET question_id=? WHERE question_id=?`);
    for (const [delId, keepId] of delMap) upd.run(keepId, delId);
  } catch (e) { /* 表可能不存在 */ }
}
const delStmt = db.prepare('DELETE FROM questions WHERE id=?');
for (const id of delIds) delStmt.run(id);
db.exec('COMMIT');

const final = db.prepare('SELECT COUNT(*) c FROM questions').get().c;
console.log(`已删除 ${delIds.length} 条，生产题库总数: ${final}`);
db.close();

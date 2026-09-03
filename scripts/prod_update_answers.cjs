// 生产更新：把本地已补全的答案/解析同步到生产（按 subject+归一化stem 匹配）
// 用法: node prod_update_answers.cjs <本地json> 
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

const DB = '/opt/saixt/server/data/saixt.db';
const JSON_PATH = process.argv[2] || '/tmp/ty_new_export.json';

function norm(s) { return String(s || '').replace(/\s+/g, ''); }

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
const db = new DatabaseSync(DB);
db.exec('PRAGMA busy_timeout=5000');

// 载入生产 (subject, normstem) -> id
const prod = new Map();
for (const r of db.prepare('SELECT id, subject, stem FROM questions').all()) {
  prod.set(`${r.subject}\u0000${norm(r.stem).slice(0, 50)}`, r.id);
}
console.log('生产题量:', prod.size);

const upd = db.prepare('UPDATE questions SET answer=?, analysis=? WHERE id=?');
let updated = 0, skipped = 0;
db.exec('BEGIN IMMEDIATE');
for (const r of data.rows) {
  const key = `${r.subject}\u0000${norm(r.stem).slice(0, 50)}`;
  const id = prod.get(key);
  if (!id) { skipped++; continue; }
  const cur = db.prepare('SELECT answer, analysis FROM questions WHERE id=?').get(id);
  const newAns = (r.answer || '').trim();
  const newAna = (r.analysis || '').trim();
  const curAns = (cur.answer || '').trim();
  const curAna = (cur.analysis || '').trim();
  // 仅当本地更完整时更新
  if ((newAns && newAns !== curAns) || (newAna && newAna !== curAna)) {
    upd.run(newAns || curAns, newAna || curAna, id);
    updated++;
  }
}
db.exec('COMMIT');
console.log(`更新: ${updated}, 未匹配: ${skipped}`);
db.close();
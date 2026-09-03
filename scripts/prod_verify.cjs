const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/opt/saixt/server/data/saixt.db');
console.log('总题量:', db.prepare('SELECT COUNT(*) c FROM questions').get().c);
for (const r of db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject ORDER BY c DESC').all()) {
  console.log(' ', String(r.c).padStart(6), r.subject);
}
// 新来源抽样
const s = db.prepare("SELECT subject, chapter, type, answer, substr(stem,1,34) st FROM questions WHERE source LIKE '2026%' AND type!='subjective' LIMIT 5").all();
for (const r of s) console.log('[新]', r.subject, '/', r.chapter, '/', r.type, '/', r.answer, '/', r.st);
console.log('新来源题数:', db.prepare("SELECT COUNT(*) c FROM questions WHERE source LIKE '2026%'").get().c);
db.close();
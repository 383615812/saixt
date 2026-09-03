// 检查生产库状态：题量 + 各科目分布 + WAL checkpoint
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/opt/saixt/server/data/saixt.db');
const r = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
console.log('checkpoint:', JSON.stringify(r));
console.log('题数:', db.prepare('SELECT COUNT(*) c FROM questions').get().c);
console.log('--- 科目分布 ---');
for (const row of db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject ORDER BY c DESC').all()) {
  console.log(`  ${row.subject}: ${row.c}`);
}
db.close();

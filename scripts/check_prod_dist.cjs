// 对比生产与本地数据库科目分布
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/opt/saixt/server/data/saixt.db');
console.log('=== 生产科目分布 ===');
for (const r of db.prepare('SELECT subject, COUNT(*) c FROM questions GROUP BY subject ORDER BY c DESC').all()) {
  console.log(`  ${r.subject}: ${r.c}`);
}
db.close();
